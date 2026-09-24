"use client";

import { useEffect, useState } from "react";

import type { Learn } from "@/lib/learn";
import { STICKERS } from "@/lib/sticker-set";
import { ALBUM_EVENT, loadAlbum, type AlbumSticker } from "@/lib/stickers";

import styles from "./sticker-album.module.css";

/** The word in the language being learned, big, and its meaning, small. */
function words(s: { en: string; ja: string }, learn: Learn) {
  return learn === "en"
    ? { big: s.en, bigLang: "en", small: s.ja, smallLang: "ja" }
    : { big: s.ja, bigLang: "ja", small: s.en, smallLang: "en" };
}

/**
 * The sticker book. Every sticker earned so far, newest first — tap one to
 * turn it over and see the moment that earned it — and, after them, the core
 * stickers still out there as silhouettes, so there is always something left
 * to find.
 */
export function StickerAlbum({ open, onClose, learn }: { open: boolean; onClose: () => void; learn: Learn }) {
  const [album, setAlbum] = useState<AlbumSticker[]>([]);
  const [flipped, setFlipped] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setAlbum(loadAlbum());
    refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener(ALBUM_EVENT, refresh);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(ALBUM_EVENT, refresh);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const found = new Set(album.map((s) => s.id));
  const coreFound = STICKERS.filter((s) => found.has(s.id)).length;
  const special = album.filter((s) => !STICKERS.some((c) => c.id === s.id)).length;
  const collected = [...album].sort((a, b) => b.at - a.at);
  const missing = STICKERS.filter((s) => !found.has(s.id));

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="sticker-book-title" onClick={onClose}>
      <div className={styles.book} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className={styles.head}>
          <h2 id="sticker-book-title">
            Sticker book <span lang="ja">シールちょう</span>
          </h2>
          <p className={styles.count}>
            <strong>{coreFound}</strong> of {STICKERS.length} found
            {special > 0 && <span className={styles.special}> · +{special} one of a kind</span>}
          </p>
        </header>

        {collected.length === 0 && (
          <p className={styles.empty}>
            No stickers yet. Change the world with your words, and one will appear here!
          </p>
        )}

        <div className={styles.grid}>
          {collected.map((s) => {
            const w = words(s, learn);
            const isFlipped = flipped === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`${styles.card} ${isFlipped ? styles.flipped : ""}`}
                onClick={() => setFlipped((f) => (f === s.id ? null : s.id))}
                aria-pressed={isFlipped}
                aria-label={`${s.en} sticker${s.quest ? ", a quest reward" : ""}. Turn over to see the moment.`}
              >
                <span className={styles.inner}>
                  <span className={styles.front}>
                    {s.quest && <span className={styles.ribbon}>★ Quest</span>}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.art} src={s.src} alt="" loading="lazy" />
                    <span className={styles.word} lang={w.bigLang}>
                      {w.big}
                    </span>
                    <span className={styles.gloss} lang={w.smallLang}>
                      {w.small}
                    </span>
                  </span>
                  <span className={styles.back}>
                    {s.memory ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.memory} src={s.memory} alt="" />
                    ) : (
                      <span className={styles.noMemory} aria-hidden="true">
                        ✦
                      </span>
                    )}
                    {s.said && <span className={styles.said}>“{s.said}”</span>}
                    {s.meaning && <span className={styles.meaning}>{s.meaning}</span>}
                    <span className={styles.when}>
                      {new Date(s.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}

          {missing.map((s) => (
            <div key={s.id} className={`${styles.card} ${styles.missing}`} aria-label="A sticker not found yet">
              <span className={styles.front}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.art} src={s.src} alt="" loading="lazy" />
                <span className={styles.word}>?</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- The "new sticker" pop-up -------------------------------------------------

/** How long the toast's chime rings, so the game can keep the mic deaf for it. */
export const STICKER_CHIME_S = 0.9;

let chimeContext: AudioContext | null = null;

/** A bright little four-note sparkle, rising. */
function chime() {
  try {
    chimeContext ??= new AudioContext();
    const ac = chimeContext;
    if (ac.state === "suspended") void ac.resume();
    const t = ac.currentTime + 0.02;
    [0, 4, 7, 12].forEach((semitones, i) => {
      const at = t + i * 0.07;
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 988 * 2 ** (semitones / 12);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.11, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.6);
    });
  } catch {
    // No audio is no reason to miss the sticker.
  }
}

export type ToastSticker = { id: string; en: string; ja: string; src: string; quest?: boolean };

/**
 * "New sticker!" — pops in, rings, and leaves by itself after ~3.5s. Give it a
 * new sticker object each time one is earned; `onDone` clears it.
 */
export function StickerToast({
  sticker,
  onDone,
  learn = "ja",
}: {
  sticker: ToastSticker | null;
  onDone: () => void;
  learn?: Learn;
}) {
  useEffect(() => {
    if (!sticker) return;
    chime();
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [sticker, onDone]);

  if (!sticker) return null;
  const w = words(sticker, learn);
  return (
    <div className={styles.toast} role="status" aria-live="polite" key={`${sticker.id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.toastArt} src={sticker.src} alt="" />
      <span className={styles.toastText}>
        <span className={styles.toastTitle}>{sticker.quest ? "Quest sticker!" : "New sticker!"}</span>
        <span className={styles.toastWord} lang={w.bigLang}>
          {w.big}
        </span>
        <span className={styles.toastGloss} lang={w.smallLang}>
          {w.small}
        </span>
      </span>
    </div>
  );
}
