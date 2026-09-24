"use client";

import { useEffect, useState } from "react";

import type { OrbisSession } from "@/hooks/use-orbis-session";

/** The slice of an Orbis session the game actually drives. */
export type WorldSession = Pick<
  OrbisSession,
  | "status"
  | "connected"
  | "runStarted"
  | "muted"
  | "prompt"
  | "error"
  | "connectSession"
  | "disconnectSession"
  | "setPrompt"
  | "selectImage"
  | "startRun"
  | "steer"
  | "restart"
  | "restarting"
  | "toggleMuted"
>;

/**
 * Development only. The whole game loop — grading, narration, Hina, the mic,
 * the ladder — with no Orbis session behind it, so takes can be rehearsed for
 * free. Nothing is sent: each steer is recorded instead, and shown on screen,
 * which also makes this the easiest way to read exactly what Orbis would be
 * asked, and when.
 *
 * Open the app with ?rehearse under `npm run dev`. Production builds ignore it.
 */
export function useRehearsalSession(): WorldSession & { lastSteer: string } {
  const [prompt, setPrompt] = useState("");
  const [connected, setConnected] = useState(false);
  const [runStarted, setRunStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [lastSteer, setLastSteer] = useState("");

  return {
    status: connected ? "ready" : "disconnected",
    connected,
    runStarted,
    muted,
    prompt,
    error: "",
    lastSteer,
    connectSession: async () => {
      setConnected(true);
      return true;
    },
    disconnectSession: async () => {
      setRunStarted(false);
      setConnected(false);
      setLastSteer("");
    },
    setPrompt,
    selectImage: () => {},
    startRun: async () => {
      setLastSteer(prompt);
      setRunStarted(true);
      return true;
    },
    steer: async () => {
      setLastSteer(prompt);
      return true;
    },
    restart: async (next: string) => {
      setPrompt(next);
      setLastSteer(next);
      return true;
    },
    restarting: false,
    toggleMuted: () => setMuted((m) => !m),
  };
}

export function useRehearsalFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    setOn(new URLSearchParams(window.location.search).has("rehearse"));
  }, []);
  return on;
}
