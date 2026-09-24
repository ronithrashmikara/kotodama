"use client";

import { useState, type ReactNode } from "react";

import type { SentenceChallenge } from "@/app/api/sentence/route";

export type SentenceState = "waiting" | "checking" | "ok" | "retry";

/**
 * Rung 0. One sentence, taught a word at a time: each word is shown, spoken,
 * glossed and said back, and it lights up in the sentence above. Once every
 * word is lit, the player says the whole sentence — and that is the moment the
 * world transforms.
 *
 * The mic is already open, so there is nothing to press. The typed box is for
 * browsers without speech recognition and rooms too loud for it; romaji counts.
 */
export function SentenceCard({
  challenge,
  step,
  state,
  heard,
  romaji,
  speaking,
  transforming,
  onReplay,
  onTyped,
  mic,
}: {
  challenge: SentenceChallenge;
  /** Index of the word being learned; the word count means "the whole sentence". */
  step: number;
  state: SentenceState;
  /** Live transcript, so they can see they are being heard. */
  heard?: string;
  /** Rungs 0-1 only; romaji is a scaffold with an expiry date. */
  romaji: boolean;
  speaking: boolean;
  /** The sentence landed and the world is changing. */
  transforming: boolean;
  onReplay: () => void;
  onTyped: (text: string) => void;
  /** The always-on microphone toggle, shown beside the replay button. */
  mic?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const words = challenge.parts.filter((p) => p.kind === "word");
  const whole = step >= words.length;
  const current = whole ? null : words[step];

  let wordIndex = -1;

  return (
    <div className={`sentence-card sentence-${state} ${whole ? "is-whole" : ""} ${transforming ? "is-transforming" : ""}`}>
      <div className="sentence-label">
        {transforming ? "Watch the world" : whole ? "Now say the whole sentence" : `Word ${step + 1} of ${words.length}`}
      </div>

      <div className="sentence-strip" lang="ja">
        {challenge.parts.map((part, i) => {
          if (part.kind === "particle") {
            return (
              <span key={i} className="sentence-particle">
                {part.kana}
              </span>
            );
          }
          wordIndex += 1;
          const status = whole || wordIndex < step ? "learned" : wordIndex === step ? "current" : "ahead";
          return (
            <span key={i} className={`sentence-word ${status}`}>
              {part.kana}
            </span>
          );
        })}
      </div>
      {challenge.sentenceEn && <div className="sentence-en">“{challenge.sentenceEn}”</div>}

      {!transforming && (
        <>
          <div className="sentence-target" lang="ja">
            {current ? current.kana : challenge.sentenceKana}
          </div>
          {romaji && (
            <div className="sentence-romaji">{current ? current.romaji : challenge.sentenceRomaji}</div>
          )}
          <div className="sentence-gloss">
            {current ? current.english : "Say it all, and the whole world changes."}
          </div>

          <div className="sentence-actions">
            <button type="button" className="sentence-replay" onClick={onReplay} disabled={speaking}>
              <SpeakerIcon />
              {speaking ? "playing…" : "hear it again"}
            </button>
            {mic}
          </div>
        </>
      )}

      <div className="sentence-status">
        {transforming ? (
          <span className="sentence-ok">You said it. The world is changing…</span>
        ) : state === "ok" ? (
          <span className="sentence-ok">{whole ? "Yes!" : "Yes, that’s it"}</span>
        ) : state === "checking" ? (
          <span className="sentence-heard">checking…</span>
        ) : state === "retry" ? (
          <span className="sentence-retry">
            {whole ? "Almost. Listen, then say the whole thing once more" : "Not quite. Listen and try once more"}
          </span>
        ) : heard ? (
          <span className="sentence-heard" lang="ja">
            {heard}
          </span>
        ) : (
          <span className="sentence-listening">
            <span className="sentence-dot" />
            listening
          </span>
        )}
      </div>

      {!transforming && (
        <form
          className="sentence-type"
          onSubmit={(e) => {
            e.preventDefault();
            if (!typed.trim()) return;
            onTyped(typed);
            setTyped("");
          }}
        >
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`No mic? Type it: ${current ? current.romaji : challenge.sentenceRomaji}`}
            aria-label="Type what you would say"
            autoComplete="off"
          />
          <button type="submit" disabled={!typed.trim()}>
            Say
          </button>
        </form>
      )}
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
