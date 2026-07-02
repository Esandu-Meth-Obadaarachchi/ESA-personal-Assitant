/**
 * Google Calendar helpers (server only). Raw fetch against Google's OAuth +
 * Calendar v3 REST — no googleapis dependency. Tasks map to all-day events on
 * their due date; the task id is stored in the event's private extended
 * properties so the reverse sync can find its task.
 */
import type { Task } from "@/lib/types";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CAL = "https://www.googleapis.com/calendar/v3";

export function oauthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/calendar/callback";
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID / _SECRET).");
  }
  return { clientId, clientSecret, redirectUri };
}

export function isCalendarConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function webhookUrl(): string | null {
  return process.env.CALENDAR_WEBHOOK_URL || null;
}

export function authUrl(state: string): string {
  const { clientId, redirectUri } = oauthConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = oauthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function calFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CAL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  return res;
}

/** All-day event body for a task. Google all-day end.date is exclusive (+1 day). */
export function taskToEvent(task: Task) {
  const end = new Date(task.dueDate as string);
  end.setDate(end.getDate() + 1);
  return {
    summary: task.title,
    description: task.notes || "",
    start: { date: task.dueDate },
    end: { date: end.toISOString().slice(0, 10) },
    extendedProperties: { private: { sbTaskId: task.id } },
  };
}

export async function createEvent(accessToken: string, task: Task): Promise<string> {
  const res = await calFetch(accessToken, `/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify(taskToEvent(task)),
  });
  if (!res.ok) throw new Error(`createEvent failed: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

export async function updateEvent(accessToken: string, eventId: string, task: Task) {
  const res = await calFetch(accessToken, `/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(taskToEvent(task)),
  });
  // 404/410 => event was deleted in Google; caller should recreate
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) throw new Error(`updateEvent failed: ${await res.text()}`);
  return true;
}

export async function deleteEvent(accessToken: string, eventId: string) {
  const res = await calFetch(accessToken, `/calendars/primary/events/${eventId}`, { method: "DELETE" });
  return res.ok || res.status === 404 || res.status === 410;
}

export interface CalEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: { sbTaskId?: string } };
}

/** Incremental (or initial) sync of primary calendar events. */
export async function listEvents(
  accessToken: string,
  syncToken?: string
): Promise<{ items: CalEvent[]; nextSyncToken?: string; expired?: boolean }> {
  const items: CalEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const p = new URLSearchParams();
    if (syncToken) p.set("syncToken", syncToken);
    else p.set("timeMin", new Date(Date.now() - 30 * 864e5).toISOString());
    if (pageToken) p.set("pageToken", pageToken);
    p.set("showDeleted", "true");
    p.set("maxResults", "250");
    const res = await calFetch(accessToken, `/calendars/primary/events?${p}`);
    if (res.status === 410) return { items: [], expired: true }; // syncToken invalid -> full resync
    if (!res.ok) throw new Error(`listEvents failed: ${await res.text()}`);
    const j = (await res.json()) as { items?: CalEvent[]; nextPageToken?: string; nextSyncToken?: string };
    items.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
    nextSyncToken = j.nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

export async function watchCalendar(accessToken: string, channelId: string, address: string, token: string) {
  const res = await calFetch(accessToken, `/calendars/primary/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, type: "web_hook", address, token }),
  });
  if (!res.ok) throw new Error(`watch failed: ${await res.text()}`);
  return (await res.json()) as { resourceId: string; expiration?: string };
}

export async function stopChannel(accessToken: string, channelId: string, resourceId: string) {
  await calFetch(accessToken, `/channels/stop`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  }).catch(() => {});
}
