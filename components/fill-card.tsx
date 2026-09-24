"use client";

import type { FillFrame, FillOption } from "@/app/api/fill/route";
import { LEARN, type Learn } from "@/lib/learn";

/**
 * Rung 2. The sentence is written for you; you supply the missing word.
 *
 * No option is wrong — whichever is chosen is what happens to the world. This
 * rung exists to teach word order and expose particles, not to mark anyone.
 * The frame carries は and が so they are met hundreds of times before anyone
 * explains what they do.
 */
export function FillCard({
  frame,
  onPick,
  disabled,
  onSpeak,
  showEnglish,
  learn = "ja",
}: {
  frame: FillFrame;
  onPick: (option: FillOption) => void;
  disabled?: boolean;
  onSpeak: (text: string) => void;
  /** English gloss under each option — on at rungs 0-2, off above. */
  showEnglish: boolean;
  learn?: Learn;
}) {
  const [before, after] = frame.frameKana.split("___");
  const { targetTag, helperTag } = LEARN[learn];

  return (
    <div className="fill-card">
      <div className="fill-label">Finish the sentence</div>

      <div className={`fill-frame ${learn === "en" ? "spaced" : ""}`} lang={targetTag}>
        <span>{before}</span>
        <span className="fill-gap" aria-label="missing word">
          ?
        </span>
        <span>{after}</span>
      </div>
      {frame.frameEn && (
        <div className="fill-frame-en" lang={helperTag}>
          {frame.frameEn.replace("___", "…")}
        </div>
      )}

      <div className="fill-options">
        {frame.options.map((option) => (
          <button
            key={option.kana}
            type="button"
            className="fill-option"
            disabled={disabled}
            onClick={() => onPick(option)}
            // Hearing it costs the player nothing and is free exposure.
            onMouseEnter={() => onSpeak(option.kana)}
          >
            <span className="fill-option-kana" lang={targetTag}>
              {option.kana}
            </span>
            {showEnglish && (
              <span className="fill-option-en" lang={helperTag}>
                {option.english}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="fill-hint">Pick one — or just say the whole sentence out loud.</p>
    </div>
  );
}
