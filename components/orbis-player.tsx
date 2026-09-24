"use client";

import { ReactorView } from "@reactor-team/js-sdk";

type OrbisPlayerProps = {
  muted: boolean;
  runStarted: boolean;
  status: string;
  /** "cover" fills the screen edge to edge; "contain" letterboxes. */
  fit?: "contain" | "cover";
};

// Before the run starts the game shows its own loading and ended states over
// this, so the empty placeholder deliberately says nothing.
export function OrbisPlayer({ muted, runStarted, status, fit = "contain" }: OrbisPlayerProps) {
  return (
    <div className="player">
      {runStarted ? (
        <ReactorView track="main_video" audioTrack="main_audio" muted={muted} videoObjectFit={fit} />
      ) : (
        <div className="player-placeholder" />
      )}
      <span className={`status status-${status}`}>{status}</span>
    </div>
  );
}
