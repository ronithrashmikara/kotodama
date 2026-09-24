"use client";

import { useEffect, useRef, useState } from "react";

import type { Choice } from "@/app/api/choices/route";
import { LEARN, type Learn } from "@/lib/learn";

/**
 * How long you have to dwell on an option before it gives you the English.
 * The delay is the pedagogy: it rewards trying to read the kana first, and
 * only helps once you have genuinely struggled. Instant translation would
 * make the Japanese decorative.
 */
const REVEAL_MS = 5500;

type ChoiceCardsProps = {
  choices: Choice[];
  onPick: (choice: Choice) => void;
  disabled: boolean;
  onSpeak: (text: string) => void;
  learn?: Learn;
};

export function ChoiceCards({ choices, onPick, disabled, onSpeak, learn = "ja" }: ChoiceCardsProps) {
  const { target, helper, targetTag, helperTag } = LEARN[learn];
  return (
    <div className="choices">
      <p className="choices-label">Which happens next?</p>
      <div className="choices-row">
        {choices.map((choice, i) => (
          <ChoiceCard
            key={`${choice.kana}-${i}`}
            choice={choice}
            tags={[targetTag, helperTag]}
            disabled={disabled}
            onPick={() => onPick(choice)}
            onSpeak={() => onSpeak(choice.kana)}
          />
        ))}
      </div>
      <p className="choices-hint">
        Read the {learn === "en" ? target : "kana"} · hold your cursor on one for a few seconds if you need the{" "}
        {helper}
      </p>
    </div>
  );
}

function ChoiceCard({
  choice,
  tags,
  disabled,
  onPick,
  onSpeak,
}: {
  choice: Choice;
  /** `lang` for the option and for its revealed meaning. */
  tags: [string, string];
  disabled: boolean;
  onPick: () => void;
  onSpeak: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  // 0 → 1 across the dwell, so the card can show the help arriving.
  const [progress, setProgress] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    timer.current = null;
    tick.current = null;
  };

  useEffect(() => clear, []);

  const startDwell = () => {
    if (revealed || disabled || timer.current) return;
    const startedAt = Date.now();
    tick.current = setInterval(() => {
      setProgress(Math.min(1, (Date.now() - startedAt) / REVEAL_MS));
    }, 80);
    timer.current = setTimeout(() => {
      clear();
      setProgress(1);
      setRevealed(true);
    }, REVEAL_MS);
  };

  const cancelDwell = () => {
    if (revealed) return;
    clear();
    setProgress(0);
  };

  return (
    <button
      type="button"
      className={`choice ${revealed ? "revealed" : ""}`}
      disabled={disabled}
      onClick={onPick}
      onMouseEnter={startDwell}
      onMouseLeave={cancelDwell}
      onFocus={startDwell}
      onBlur={cancelDwell}
    >
      <span className="choice-kana" lang={tags[0]}>
        {choice.kana}
      </span>

      <span className="choice-reveal" aria-live="polite" lang={tags[1]}>
        {revealed ? choice.english : ""}
      </span>

      {/* Fills as you dwell, so the help feels earned rather than sudden. */}
      {!revealed && (
        <span className="choice-progress" aria-hidden="true">
          <span className="choice-progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}

      <span
        className="choice-speak"
        role="button"
        tabIndex={-1}
        aria-label="Hear it"
        onClick={(e) => {
          e.stopPropagation();
          onSpeak();
        }}
      >
        <SpeakerIcon />
      </span>
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}
