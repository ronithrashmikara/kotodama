"use client";

import { useEffect, useRef, useState } from "react";

import type { NarrationToken } from "@/app/api/narrate/route";

type NarrationProps = {
  tokens: NarrationToken[];
  english: string;
  savedSurfaces: Set<string>;
  onSaveWord: (token: NarrationToken) => void;
  onReplay: () => void;
  speaking: boolean;
  /** Bilingual speakers show their English inline rather than behind a toggle. */
  englishAlwaysOn?: boolean;
};

export function Narration({
  tokens,
  english,
  savedSurfaces,
  onSaveWord,
  onReplay,
  speaking,
  englishAlwaysOn = false,
}: NarrationProps) {
  // Which token's gloss is pinned open (click), vs. merely hovered.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [showEnglish, setShowEnglish] = useState(englishAlwaysOn);
  const [justSaved, setJustSaved] = useState<number | null>(null);

  // A double-click also fires two click events, so a plain onClick would
  // toggle the gloss open and shut before the save lands. Defer the click and
  // let the double-click cancel it.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  const handleClick = (index: number) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      setPinned((current) => (current === index ? null : index));
    }, 220);
  };

  const handleDoubleClick = (index: number) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    onSaveWord(tokens[index]);
    setPinned(index);
    setJustSaved(index);
    setTimeout(() => setJustSaved((c) => (c === index ? null : c)), 1400);
  };

  const active = pinned ?? hovered;

  return (
    <div className="narration">
      <div className="narration-head">
        <span className="narration-label">The world says</span>
        <div className="narration-actions">
          <button
            type="button"
            className={`narration-replay ${speaking ? "speaking" : ""}`}
            onClick={onReplay}
            title="Hear it again"
            aria-label="Hear it again"
          >
            <SpeakerIcon />
          </button>
          <button
            type="button"
            className="narration-toggle"
            onClick={() => setShowEnglish((v) => !v)}
            aria-pressed={showEnglish}
          >
            {showEnglish ? "Hide English" : "Show English"}
          </button>
        </div>
      </div>

      <p className="narration-text">
        {tokens.map((token, i) => (
          <span
            key={`${token.surface}-${i}`}
            className={[
              "narration-token",
              active === i ? "active" : "",
              savedSurfaces.has(token.surface) ? "saved" : "",
              justSaved === i ? "flash" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((c) => (c === i ? null : c))}
            onClick={() => handleClick(i)}
            onDoubleClick={() => handleDoubleClick(i)}
          >
            {token.surface}
            {active === i && (
              <span className="narration-gloss" role="tooltip">
                <span className="gloss-reading">{token.reading}</span>
                <span className="gloss-meaning">{token.meaning}</span>
                <span className="gloss-hint">
                  {justSaved === i
                    ? "saved to your words"
                    : savedSurfaces.has(token.surface)
                      ? "already saved"
                      : "double-click to save"}
                </span>
              </span>
            )}
          </span>
        ))}
      </p>

      {showEnglish && <p className="narration-english">{english}</p>}

      <p className="narration-hint">
        Hover or tap a word for its meaning · double-click to save it
      </p>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}
