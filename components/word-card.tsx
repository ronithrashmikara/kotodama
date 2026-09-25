"use client";

import { useState, type ReactNode } from "react";

import type { MagicWord } from "@/app/api/words/route";
import { LEARN, type Learn } from "@/lib/learn";
import type { LookWord } from "@/lib/look";

export type WordState = "waiting" | "checking" | "retry";

/**
 * The lowest rung: three magic words, each a sticker. Say ONE and it happens —
 * no sentence, no grammar, just the word. Tapping a sticker says it aloud, so
 * a child who cannot read yet still knows what to say.
 *
 * Below them, the words for looking around (ひだり, うしろ, みぎ) turn the camera.
 */
export function WordCard({
  words,
  looks,
  state,
  said,
  heard,
  learn = "ja",
  transforming,
  onHear,
  onTyped,
  mic,
}: {
  words: MagicWord[];
  looks: LookWord[];
  state: WordState;
  /** The word that was said, while its magic plays. */
  said?: string | null;
  /** Live transcript, so they can see they are being heard. */
  heard?: string;
  learn?: Learn;
  transforming: boolean;
  onHear: (word: string) => void;
  onTyped: (text: string) => void;
  mic?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const { targetTag, helperTag } = LEARN[learn];
  const english = learn === "en";

  return (
    <div className={`word-card word-${state} ${transforming ? "is-transforming" : ""}`}>
      <div className="word-label" lang={helperTag}>
        {transforming
          ? english
            ? "みて！ せかいが かわるよ"
            : "Look! The world is changing…"
          : english
            ? "まほうの ことばを ひとつ いってね！"
            : "Say one magic word!"}
      </div>

      <div className="word-tiles">
        {words.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`word-tile ${said === w.word ? "chosen" : said ? "faded" : ""}`}
            onClick={() => onHear(w.word)}
            title={english ? "タップすると きこえるよ" : "Tap to hear it"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/stickers/${w.id}.webp`} alt="" />
            <span className="word-say" lang={targetTag}>
              {w.word}
            </span>
            {w.reading && <span className="word-reading">{w.reading}</span>}
            <span className="word-meaning" lang={helperTag}>
              {w.meaning}
            </span>
          </button>
        ))}
      </div>

      {!transforming && (
        <>
          <div className="word-status">
            {state === "checking" ? (
              <span className="sentence-heard">…</span>
            ) : state === "retry" ? (
              <span className="sentence-retry" lang={helperTag}>
                {english ? "もういちど！ ことばを タップして きいてみてね" : "Try again! Tap a sticker to hear it"}
              </span>
            ) : heard ? (
              <span className="sentence-heard" lang={targetTag}>
                {heard}
              </span>
            ) : (
              <span className="sentence-listening">
                <span className="sentence-dot" />
                {english ? "きいてるよ" : "listening"}
              </span>
            )}
            {mic}
          </div>

          <div className="look-row">
            <span className="look-label" lang={helperTag}>
              {english ? "👀 みまわそう" : "👀 Look around"}
            </span>
            {looks.map((l) => (
              <button key={l.id} type="button" className="look-chip" onClick={() => onHear(l.word)}>
                <span aria-hidden="true">{l.arrow}</span>
                <span lang={targetTag}>{l.word}</span>
                <small lang={helperTag}>{l.meaning}</small>
              </button>
            ))}
          </div>

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
              placeholder={english ? "マイクが ない？ ここに かいてね" : "No mic? Type it"}
              lang={targetTag}
            />
            <button type="submit" disabled={!typed.trim()}>
              {english ? "いう" : "Say"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
