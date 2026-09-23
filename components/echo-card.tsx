"use client";

import type { EchoWord } from "@/app/api/word/route";

/**
 * Rung 0. One word, shown as large as it deserves to be, with every support a
 * beginner needs: the kana, the romaji they will actually try to pronounce,
 * the English, and a button to hear it again.
 *
 * The mic is already open — there is deliberately nothing to press to start
 * speaking. Asking someone to find and click a button before their first ever
 * Japanese word adds a step exactly where confidence is thinnest.
 */
export function EchoCard({
  word,
  romaji,
  onReplay,
  speaking,
  heard,
  state,
}: {
  word: EchoWord;
  /** Rungs 0-1 only; romaji is a scaffold with an expiry date. */
  romaji: boolean;
  onReplay: () => void;
  speaking: boolean;
  /** Live transcript, so they can see they are being heard. */
  heard?: string;
  state: "waiting" | "ok" | "retry";
}) {
  return (
    <div className={`echo-card echo-${state}`}>
      <div className="echo-label">Say this out loud</div>

      <div className="echo-kana" lang="ja">
        {word.kana}
      </div>
      {romaji && word.romaji && <div className="echo-romaji">{word.romaji}</div>}
      <div className="echo-english">{word.english}</div>

      <button type="button" className="echo-replay" onClick={onReplay} disabled={speaking}>
        <SpeakerIcon />
        {speaking ? "playing…" : "hear it again"}
      </button>

      <div className="echo-status">
        {state === "ok" ? (
          <span className="echo-ok">Yes — that&rsquo;s it</span>
        ) : state === "retry" ? (
          <span className="echo-retry">Not quite — try once more</span>
        ) : heard ? (
          <span className="echo-heard" lang="ja">
            {heard}
          </span>
        ) : (
          <span className="echo-listening">
            <span className="echo-dot" />
            listening
          </span>
        )}
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
    </svg>
  );
}
