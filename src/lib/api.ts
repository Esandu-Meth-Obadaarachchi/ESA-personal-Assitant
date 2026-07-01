import { auth } from "@/lib/firebase/client";

/** fetch() with the current user's Firebase ID token attached. */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** POST a JSON body with auth; returns parsed JSON or throws with the server message. */
export async function postJSON<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}
