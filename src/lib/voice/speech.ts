/**
 * Thin wrappers over the browser's built-in Web Speech APIs — recognition for
 * listening, synthesis for speaking. Both ship with Chrome/Edge and cost nothing;
 * there is no third-party service, model download or API key anywhere in here.
 *
 * TypeScript's lib.dom does not declare SpeechRecognition (it is still vendor
 * prefixed), so the minimal surface we use is declared below rather than pulling
 * in a types package.
 */

export interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResultLike };
}

export interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return !!recognitionCtor();
}

export function createRecognition(lang = "en-US"): RecognitionLike | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;
  return rec;
}

/* ------------------------------- wake word -------------------------------- */

/**
 * "Hey Lune" and the ways a speech recogniser actually hears it. The engine has
 * no idea "Lune" is a word, so it reaches for the nearest real one — loon, luna,
 * moon, lune, len. Being generous here is the difference between the wake word
 * working and it feeling broken; a false trigger only costs one ignored command.
 * The leading greeting stays tight so ordinary speech ("the moon") cannot arm it.
 */
const WAKE_RE = /\b(?:hey|hi|hay|ok|okay|yo)\s+(?:lune|loon|luna|lunar|moon|loone|lun|len|line|lou|luen)\b/g;

/** Strip everything a matcher should not care about: case, punctuation, runs of space. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look for the wake phrase and return whatever was said *after* it, so
 * "hey Lune what's overdue" arms and carries "what's overdue" straight into the
 * command — the user never has to pause between the two.
 *
 * The LAST match wins, which makes this idempotent: the caller re-runs it over
 * the growing transcript on every result, and a repeated "hey Lune… hey Lune,
 * what's due" still yields just the command.
 */
export function findWake(text: string): { matched: boolean; rest: string } {
  const norm = normalise(text);
  let last: RegExpExecArray | null = null;
  WAKE_RE.lastIndex = 0;
  for (let m = WAKE_RE.exec(norm); m; m = WAKE_RE.exec(norm)) last = m;
  if (!last) return { matched: false, rest: "" };
  return { matched: true, rest: norm.slice(last.index + last[0].length).trim() };
}

/* -------------------------------- speaking -------------------------------- */

/** Markdown reads terribly aloud. Flatten it to plain prose and cap the length.
 *  The cap is a backstop — the voice persona already asks for under 40 words —
 *  and stays low because Chrome's synthesis truncates long utterances anyway. */
export function speakable(markdown: string, maxChars = 400): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[_~|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  // Cut at the last sentence end inside the cap so it never stops mid-word.
  const clipped = text.slice(0, maxChars);
  const lastStop = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  return lastStop > maxChars * 0.5 ? clipped.slice(0, lastStop + 1) : clipped + "…";
}

export function synthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak text, resolving when the utterance finishes (or immediately if speech
 *  synthesis is unavailable, so callers never hang waiting for a voice). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!synthesisSupported() || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech() {
  if (synthesisSupported()) window.speechSynthesis.cancel();
}
