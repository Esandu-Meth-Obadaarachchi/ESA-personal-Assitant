"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useNavSelection } from "@/lib/data/useNavSelection";
import { postJSON } from "@/lib/api";
import type { AgentCard, NavigateCardData } from "@/lib/types";
import {
  cancelSpeech,
  createRecognition,
  findWake,
  speak,
  speakable,
  speechSupported,
  type RecognitionLike,
} from "./speech";

/**
 * "Hey Lune" — always-on voice control, built entirely on the browser's free
 * Web Speech APIs. One long-lived recognition session drives a small state
 * machine:
 *
 *   idle  ──hears "hey lune"──►  armed  ──silence──►  thinking  ──►  speaking  ──► idle
 *
 * The command is sent to the same `/api/chat` agent the typed chat uses, so voice
 * inherits every tool (tasks, knowledge, navigation) with no separate intent
 * parsing. The only voice-specific server flag is `voice: true`, which tells the
 * persona to keep the answer short enough to listen to.
 */

export type VoicePhase = "off" | "idle" | "armed" | "thinking" | "speaking";

interface VoiceState {
  supported: boolean;
  enabled: boolean;
  phase: VoicePhase;
  /** Live text of the command being captured — shown while `armed`. */
  transcript: string;
  /** The last answer, in text, so the UI can show what was said aloud. */
  reply: string;
  error: string | null;
  toggle: () => void;
  /** Start capturing a command now, without saying the wake word. */
  arm: () => void;
  /** Stop speaking / abandon the current command and go back to listening. */
  cancel: () => void;
}

const VoiceCtx = createContext<VoiceState | null>(null);

const STORAGE_KEY = "sb-voice-enabled";
/** Silence that ends a command once the user has actually said something. */
const SILENCE_MS = 1600;
/** Longer grace after the wake word alone, so "Hey Lune… <thinks>… what's due?" works. */
const EMPTY_SILENCE_MS = 4000;
/** Hard ceiling on one spoken command. */
const MAX_COMMAND_MS = 15000;
/** Keep the spoken conversation short — it is context, not a transcript. */
const MAX_HISTORY = 6;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentWorkspace, currentProject } = useWorkspace();
  const applyNavSelection = useNavSelection();

  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The recognition object outlives every render, so its handlers would close
  // over stale state. Everything they read lives in a ref instead.
  const recRef = useRef<RecognitionLike | null>(null);
  const wantRunningRef = useRef(false);
  const runningRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("off");
  const finalRef = useRef("");
  const bufferRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxCmdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  // Bumped by cancel(). An in-flight command whose id no longer matches is
  // abandoned — otherwise cancelling mid-"thinking" would still speak the answer
  // and navigate once the request finally came back.
  const runIdRef = useRef(0);
  // Latest workspace/project without re-creating the recognition handlers.
  const scopeRef = useRef({ workspaceId: "", projectId: undefined as string | undefined });

  const setPhaseBoth = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    scopeRef.current = {
      workspaceId: currentWorkspace?.id ?? "",
      projectId: currentProject?.id,
    };
  }, [currentWorkspace, currentProject]);

  useEffect(() => {
    setSupported(speechSupported());
    setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    if (maxCmdRef.current) clearTimeout(maxCmdRef.current);
    silenceRef.current = null;
    maxCmdRef.current = null;
  }, []);

  /* ----------------------------- mic lifecycle ---------------------------- */

  const startRec = useCallback(() => {
    const rec = recRef.current;
    if (!rec || runningRef.current || !wantRunningRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      rec.start();
      runningRef.current = true;
    } catch {
      // "already started" — the browser and our flag disagreed; trust the browser.
      runningRef.current = true;
    }
  }, []);

  const stopRec = useCallback(() => {
    wantRunningRef.current = false;
    if (restartRef.current) clearTimeout(restartRef.current);
    restartRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
  }, []);

  /* ------------------------------ the command ----------------------------- */

  const runCommand = useCallback(
    async (text: string) => {
      const command = text.trim();
      clearTimers();
      // Mic off while we think and talk, so Lune never hears her own reply and
      // re-triggers on it. Every exit path below has to turn it back on.
      stopRec();

      const backToListening = () => {
        setTranscript("");
        setPhaseBoth("idle");
        wantRunningRef.current = true;
        startRec();
      };

      // Nothing said after the wake word, or the workspace has not loaded yet —
      // drop back to listening rather than sending an empty turn to the agent.
      if (!command || !scopeRef.current.workspaceId) return backToListening();

      const runId = ++runIdRef.current;
      setPhaseBoth("thinking");
      setTranscript(command);

      let answer: string;
      try {
        const res = await postJSON<{ answer: string; cards?: AgentCard[] }>("/api/chat", {
          message: command,
          workspaceId: scopeRef.current.workspaceId,
          projectId: scopeRef.current.projectId,
          history: historyRef.current,
          voice: true,
        });
        // Cancelled while the request was in flight — drop the answer on the
        // floor rather than speaking over whatever the user is doing now.
        if (runId !== runIdRef.current) return backToListening();
        answer = res.answer || "I didn't catch a useful answer for that.";

        historyRef.current = [
          ...historyRef.current,
          { role: "user" as const, content: command },
          { role: "assistant" as const, content: answer },
        ].slice(-MAX_HISTORY);

        // Navigation runs before speaking, so the screen has already moved by the
        // time the user hears "opening Today".
        const nav = res.cards?.find((c) => c.kind === "navigate")?.data as NavigateCardData | undefined;
        if (nav) {
          applyNavSelection(nav);
          router.push(nav.route);
        }
      } catch (e) {
        if (runId !== runIdRef.current) return backToListening();
        answer = "Something went wrong reaching the agent.";
        setError(e instanceof Error ? e.message : String(e));
      }

      setReply(answer);
      setPhaseBoth("speaking");
      await speak(speakable(answer));
      backToListening();
    },
    [applyNavSelection, clearTimers, router, setPhaseBoth, startRec, stopRec]
  );
  const runCommandRef = useRef(runCommand);
  useEffect(() => {
    runCommandRef.current = runCommand;
  }, [runCommand]);

  const armSilenceTimer = useCallback(() => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    const wait = bufferRef.current.trim() ? SILENCE_MS : EMPTY_SILENCE_MS;
    silenceRef.current = setTimeout(() => {
      const text = bufferRef.current;
      bufferRef.current = "";
      finalRef.current = "";
      void runCommandRef.current(text);
    }, wait);
  }, []);

  /* --------------------------- recognition wiring -------------------------- */

  useEffect(() => {
    if (!enabled || !supported) return;

    const rec = createRecognition();
    if (!rec) return;
    recRef.current = rec;
    wantRunningRef.current = true;
    setError(null);
    setPhaseBoth("idle");

    rec.onresult = (e) => {
      // Only the wake word and the command itself matter; ignore anything the mic
      // catches while the agent is working or talking.
      if (phaseRef.current !== "idle" && phaseRef.current !== "armed") return;

      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalRef.current += " " + t;
        else interim += " " + t;
      }
      const heard = (finalRef.current + " " + interim).trim();
      if (!heard) return;

      // `finalRef` keeps accumulating across the wake word and the command, and
      // the wake phrase is stripped off the front on every pass rather than being
      // consumed once. Consuming it would lose the tail of the same result
      // ("hey Lune what's overdue") as soon as the next result overwrote it.
      const { matched, rest } = findWake(heard);

      if (phaseRef.current === "idle") {
        if (!matched) {
          // Keep the tail only — enough to catch a wake phrase split across two
          // results, without growing unbounded over a long listening session.
          finalRef.current = finalRef.current.slice(-160);
          return;
        }
        bufferRef.current = rest;
        setTranscript(rest);
        setPhaseBoth("armed");
        armSilenceTimer();
        if (maxCmdRef.current) clearTimeout(maxCmdRef.current);
        maxCmdRef.current = setTimeout(() => {
          const text = bufferRef.current;
          bufferRef.current = "";
          finalRef.current = "";
          void runCommandRef.current(text);
        }, MAX_COMMAND_MS);
        return;
      }

      // Armed via the wake word -> strip it; armed by the button -> take it all.
      const command = matched ? rest : heard;
      bufferRef.current = command;
      setTranscript(command);
      armSilenceTimer();
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        // Permission refused — there is nothing to retry, so switch voice off
        // rather than looping on a prompt the browser will not show again.
        wantRunningRef.current = false;
        setError("Microphone access is blocked. Allow it in your browser's site settings.");
        setEnabled(false);
        localStorage.setItem(STORAGE_KEY, "0");
      }
      // "no-speech", "aborted", "network" are all routine; onend restarts.
    };

    rec.onend = () => {
      runningRef.current = false;
      // Chrome ends a continuous session on its own after a stretch of silence.
      // Restarting is what makes "always listening" actually always listen.
      if (!wantRunningRef.current) return;
      restartRef.current = setTimeout(() => startRec(), 300);
    };

    startRec();

    // A background tab should not hold the mic open.
    const onVisibility = () => {
      if (document.hidden) {
        if (phaseRef.current === "idle" || phaseRef.current === "armed") stopRec();
      } else if (!wantRunningRef.current && phaseRef.current !== "thinking" && phaseRef.current !== "speaking") {
        wantRunningRef.current = true;
        startRec();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
      wantRunningRef.current = false;
      if (restartRef.current) clearTimeout(restartRef.current);
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
      runningRef.current = false;
      recRef.current = null;
      cancelSpeech();
      finalRef.current = "";
      bufferRef.current = "";
      setPhaseBoth("off");
      setTranscript("");
    };
  }, [enabled, supported, armSilenceTimer, clearTimers, setPhaseBoth, startRec, stopRec]);

  /* -------------------------------- controls ------------------------------- */

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      if (!next) cancelSpeech();
      return next;
    });
    setError(null);
  }, []);

  /** Skip the wake word and start capturing now. Clearing `finalRef` is what
   *  makes this work: with no wake phrase in the transcript, everything heard
   *  from here counts as the command. */
  const arm = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    finalRef.current = "";
    bufferRef.current = "";
    setTranscript("");
    setPhaseBoth("armed");
    armSilenceTimer();
  }, [armSilenceTimer, setPhaseBoth]);

  const cancel = useCallback(() => {
    runIdRef.current++;
    cancelSpeech();
    clearTimers();
    finalRef.current = "";
    bufferRef.current = "";
    setTranscript("");
    if (phaseRef.current !== "off") setPhaseBoth("idle");
  }, [clearTimers, setPhaseBoth]);

  return (
    <VoiceCtx.Provider
      value={{ supported, enabled, phase, transcript, reply, error, toggle, arm, cancel }}
    >
      {children}
    </VoiceCtx.Provider>
  );
}

export function useVoice(): VoiceState {
  const ctx = useContext(VoiceCtx);
  if (!ctx) throw new Error("useVoice must be used inside VoiceProvider");
  return ctx;
}
