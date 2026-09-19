"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useRef } from "react";

import { NanoBananaExample } from "@/components/nano-banana-example";
import { OrbisControls } from "@/components/orbis-controls";
import { OrbisPlayer } from "@/components/orbis-player";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";

export function OrbisDemo() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      // Do not permanently cache a failed token request.
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <section className="demo-shell">
      <ReactorProvider
        apiUrl="https://api.reactor.inc"
        modelName={ORBIS_MODEL_NAME}
        modelTracks={[...ORBIS_TRACKS]}
        connectOptions={{ autoConnect: false }}
        jwtToken={getJwt}
      >
        <OrbisSession
          clearJwt={clearJwt}
          getCurrentJwt={getCurrentJwt}
        />
      </ReactorProvider>
    </section>
  );
}

function OrbisSession({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);

  return (
    <>
      <div className="session-grid">
        <OrbisPlayer
          connected={session.connected}
          muted={session.muted}
          runStarted={session.runStarted}
          status={session.status}
        />
        <OrbisControls session={session} />
      </div>

      <NanoBananaExample
        disabled={
          !session.connected || session.runStarted || session.controlsBusy
        }
        onActivityChange={session.setNanoBusy}
        onReady={session.startFromNanoOutput}
      />
    </>
  );
}
