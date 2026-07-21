# Voice — "Hey Lune"

Always-on voice control for the agent. Say **"Hey Lune"** from any screen, speak a
command, and Lune answers aloud — and moves you around the app if that is what you
asked for.

Everything here runs on APIs already built into the browser. There is no wake-word
service, no speech vendor, no extra API key and no added infrastructure cost. The
only spend is the Claude call the command triggers, which is the same call a typed
message makes.

---

## The pieces, and why each was chosen

| Job | What does it | Why |
|---|---|---|
| Wake word | Web Speech recognition + string match (`findWake`) | Free and dependency-free. A dedicated engine (Porcupine et al.) is more accurate but needs an account and a hosted model |
| Speech → text | Same recognition session | Already open for the wake word, so the command needs no second session and no restart latency |
| Deciding what the command means | The existing `/api/chat` agent | No separate intent classifier to build or keep in sync — voice inherits every tool the typed chat has, including new ones |
| Text → speech | `window.speechSynthesis` | Free and instant. Generic-sounding; a hosted voice would carry Lune's identity better, at a per-character cost |

The important decision is the third row. Voice does **not** parse intent itself — it
transcribes, hands the text to the same tool-calling loop `/agent` uses, and reacts
to what comes back. Adding a tool in `lib/ai/tools.ts` makes it reachable by voice
for free, and one utterance can mix navigation with real work ("open the website
project and tell me what's overdue").

---

## The loop

```
                 hears "hey lune"            silence
   idle ────────────────────────────► armed ─────────► thinking ──► speaking ──► idle
    ▲                                                      │            │
    │                                    POST /api/chat ───┘            │
    │                                    (voice: true)                  │
    └────────────────── mic restarts once she stops talking ────────────┘
```

`src/lib/voice/VoiceContext.tsx` owns this. `src/lib/voice/speech.ts` holds the
browser API wrappers and the two pure functions worth reasoning about on their own
(`findWake`, `speakable`).

**idle** — one continuous recognition session runs, and every result is scanned for
the wake phrase. Nothing leaves the browser in this state; no audio is uploaded and
no request is made until a command is captured.

**armed** — the wake phrase matched. Whatever followed it in the same breath already
counts as the command, so "Hey Lune what's overdue" works without a pause. Capture
ends after 1.6s of silence (4s if nothing has been said yet, so a pause to think is
allowed), or 15s hard stop.

**thinking** — the transcript goes to `/api/chat` with `voice: true`. The mic is
closed for this whole phase and the next.

**speaking** — any `navigate` card is acted on *first* so the screen has already
moved by the time the answer is read out. Then the answer is flattened out of
markdown and spoken.

---

## Details that matter

**The mic closes while Lune talks.** Otherwise she hears her own reply through the
speakers, matches the wake word in it, and triggers herself. Every exit path from
`runCommand` — including cancellation and errors — has to reopen it, which is why
that function funnels through a single `backToListening()`.

**The wake phrase is stripped on every pass, not consumed once.** The recogniser
revises interim results, so a transcript is rewritten as it grows. `findWake` takes
the *last* match and is safe to re-run over the same growing string, which keeps
"hey Lune what's due" from losing its tail when the next result arrives.

**Mishearings are matched deliberately.** The recogniser has never heard of "Lune",
so it reaches for the nearest real word — loon, luna, moon, len. `WAKE_RE` accepts
those. The leading greeting (`hey|hi|ok|okay|yo`) stays strict so ordinary speech
("the moon is out") cannot arm it. A false trigger costs one ignored command; a
missed wake word makes the feature feel broken, so the trade leans permissive.

**Routes are chosen by the server, never by the model.** `navigate_to` takes an enum
key, and `NAV_ROUTES` in `lib/ai/tools.ts` maps it to a path. The model cannot emit
an arbitrary URL for the client to push.

**Opening a project means switching workspace first.** `selectProject` only looks
inside the *current* workspace's projects, so a project id from another workspace
resolves to null and nothing happens. The navigate card therefore carries the
project's `workspaceId`, and `useNavSelection` routes cross-workspace jumps through
`openWorkspaceProject` (which stashes the project, switches workspace, and selects
it once that workspace's projects load). Within the current workspace that same call
would *clear* the selection — the workspace id does not change, so nothing re-runs to
restore it — hence the branch. Both voice and the agent chat card share that hook so
the rule cannot drift between them.

**Names are matched leniently, because speech splits them.** `matchByName` tries
exact, then substring, then a comparison with spaces and punctuation stripped —
"power prox" has to find "PowerProx". It backs both project and workspace lookup.

**Spoken answers are shortened at the prompt, not after the fact.** `voice: true`
appends a rule to the persona asking for under 40 words in plain prose. `speakable()`
is only a backstop — it strips markdown and caps length, because Chrome's synthesis
truncates long utterances anyway.

**Continuous recognition stops on its own.** Chrome ends the session after a stretch
of silence, so `onend` restarts it. That restart loop is what "always listening"
actually is. A hidden tab stops the mic and resumes on return.

---

## Limits worth knowing

- **Chrome and Edge only, in practice.** Firefox has no `SpeechRecognition`; the
  control hides itself when the API is missing. Safari's support for *continuous*
  recognition is unreliable — push-to-talk (click the mic) is the fallback there.
- **The tab must be open and focused.** Browsers stop the mic in a backgrounded tab.
  This is a "say it while the app is open" assistant, not an Alexa-style one that
  answers from across the room. That would need a native app or a PWA with a
  background service.
- **Recognition needs a network connection** — Chrome does it server-side, not on
  device. It is free, but it is not offline.
- **First use prompts for microphone permission.** If it is denied, voice switches
  itself off and says so rather than retrying a prompt the browser will not re-show.
- **Project tabs are not reachable by voice.** "Go to the board" does nothing,
  because the tab is local state in `app/(app)/page.tsx` persisted to
  `localStorage`, not a route. Making tabs URL-driven would fix it.

---

## Using it

The mic control sits bottom-right on every screen inside the app shell.

- **Click** (off) — turn voice on. Prompts for mic permission the first time.
- **Click** (on) — start capturing straight away, no wake word needed.
- **Right-click / long-press** — turn voice off.
- **X in the bubble** — stop talking or abandon the command in flight.

The on/off choice persists in `localStorage` under `sb-voice-enabled`. Voice
conversations keep the last few turns in memory for context but are **not** saved to
the `chats` collection — the typed chat at `/agent` remains the thing with history.

Things that work today:

- "Hey Lune, what's overdue?"
- "Hey Lune, go to today" / "open knowledge" / "take me to all my tasks"
- "Hey Lune, open the Website project" (works across workspaces, not just the open one)
- "Hey Lune, switch to the SLT workspace"
- "Hey Lune, add a task to call the supplier on Friday"
- "Hey Lune, what did we decide about pricing?" (searches the knowledge base)

---

## Where the code lives

```
src/lib/voice/speech.ts        Web Speech wrappers, findWake, speakable
src/lib/voice/VoiceContext.tsx The state machine + the /api/chat call
src/components/shell/VoiceOrb.tsx  The floating control and status bubble
src/components/shell/AppFrame.tsx  Mounts the provider + control app-wide
src/lib/ai/tools.ts            navigate_to tool + NAV_ROUTES
src/lib/ai/persona.ts          The voice-mode brevity rules
src/lib/data/useNavSelection.ts    Applies a navigate card's workspace/project selection
```

Adding a screen to voice navigation is one line in `NAV_ROUTES` — the enum in the
tool schema is derived from its keys, so the model picks it up automatically.
(`project` and `workspace` are separate destinations handled outside that map,
since they resolve a name rather than a fixed path.)
