"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { playMagicReveal, playTranslate, type MagicStrength } from "@/lib/magic-sound";

export type Magic = {
  /** A new id restarts the spell, even for the same strength. */
  id: number;
  strength: MagicStrength;
  /** The player's words, which float up into the world and burst. */
  words?: string;
  /** What those words mean: mid-flight, the words turn into it. */
  meaning?: string;
  /** Big spells only: called the moment the mist clears on the new world. */
  onReveal?: () => void;
};

/** How long the small and medium spells stay on screen, in ms. */
export const MAGIC_MS: Record<MagicStrength, number> = { small: 1900, medium: 3300, big: 4600 };

/**
 * How long the words fly, and how far in they turn into their meaning: late enough
 * to read the words, early enough to read the meaning after it.
 */
const WORDS_MS: Record<MagicStrength, number> = { small: 1800, medium: 3100, big: 4000 };
const TURN_AT = 0.36;

/**
 * A big spell holds its mist until the live picture has actually changed.
 * Measured live: a park turning to night crosses this threshold 6-9s after
 * the steer, while changes Orbis does not render peak around 10-12 — so a
 * fixed-length spell would clear onto a world that has not changed yet, which
 * is worse than no magic at all.
 */
const REVEAL = { minMs: 2600, maxMs: 14_000, everyMs: 250, threshold: 15 };
/** How long the mist takes to clear after the reveal. */
const CLEAR_MS = 1500;

const SPARKS = ["✦", "✧", "⋆", "❀", "✿", "✦"];
// Candy colours, not pastels: pastel sparkles disappear into white mist.
const TINTS = ["#ffd35c", "#ff8cc6", "#b9a2ff", "#72e6bd", "#86ccff"];

type Cloud = { x: number; y: number; size: number; delay: number; dx: number; dy: number; peak: number };
type Spark = { x: number; y: number; size: number; delay: number; rise: number; glyph: string; tint: string; dur: number };

function spell(strength: MagicStrength): { clouds: Cloud[]; sparks: Spark[] } {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const clouds: Cloud[] = [];
  const cloudCount = strength === "big" ? 11 : strength === "medium" ? 7 : 0;
  for (let i = 0; i < cloudCount; i++) {
    // Mist gathers from the edges and drifts in toward the middle.
    const side = i % 4;
    const x = side === 0 ? r(-8, 12) : side === 1 ? r(88, 108) : r(0, 100);
    const y = side === 2 ? r(-10, 14) : side === 3 ? r(80, 108) : r(10, 90);
    clouds.push({
      x,
      y,
      size: r(strength === "big" ? 38 : 28, strength === "big" ? 62 : 44),
      delay: r(0, 0.5),
      dx: (50 - x) * r(0.25, 0.5),
      dy: (50 - y) * r(0.25, 0.5),
      // Mist the world still shows through — magic fog, not a whiteout.
      peak: r(strength === "big" ? 0.55 : 0.4, strength === "big" ? 0.8 : 0.62),
    });
  }

  const sparks: Spark[] = [];
  const sparkCount = strength === "big" ? 32 : strength === "medium" ? 22 : 12;
  for (let i = 0; i < sparkCount; i++) {
    const small = strength === "small";
    sparks.push({
      // A word's twinkle stays around the card; a spell fills the sky.
      x: small ? r(36, 64) : r(6, 94),
      y: small ? r(62, 82) : r(35, 95),
      size: r(small ? 16 : strength === "big" ? 20 : 18, small ? 26 : strength === "big" ? 40 : 34),
      delay: r(0, small ? 0.35 : strength === "big" ? 2.2 : 1.2),
      rise: -r(small ? 60 : 120, small ? 140 : 320),
      glyph: SPARKS[i % SPARKS.length],
      tint: TINTS[i % TINTS.length],
      dur: r(1.1, small ? 1.3 : 2.1),
    });
  }
  return { clouds, sparks };
}

/**
 * Reads the live video as a tiny 32×18 image, so two moments of the world can
 * be compared. The stream is a MediaStream, never cross-origin, so the canvas
 * is never tainted; null only while the video has no frame to give.
 */
function frameReader(video: HTMLVideoElement): () => Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return () => {
    if (!g || video.readyState < 2) return null;
    try {
      g.drawImage(video, 0, 0, 32, 18);
      return g.getImageData(0, 0, 32, 18).data.slice();
    } catch {
      return null;
    }
  };
}

/**
 * How far the world's colours have moved, 0-255: the average colour of each
 * cell in a 4×3 grid, compared cell by cell. A live world is never still —
 * Orbis redraws branches and petals every chunk — so comparing pixels would
 * fire on that alone. Comparing regions only moves when the light or the
 * weather does: dusk to night, a park going white under snow.
 */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const cells = (d: Uint8ClampedArray) => {
    const sums = new Array(12 * 3).fill(0);
    const counts = new Array(12).fill(0);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 32; x++) {
        const cell = Math.min(2, Math.floor(y / 6)) * 4 + Math.min(3, Math.floor(x / 8));
        const i = (y * 32 + x) * 4;
        sums[cell * 3] += d[i];
        sums[cell * 3 + 1] += d[i + 1];
        sums[cell * 3 + 2] += d[i + 2];
        counts[cell]++;
      }
    }
    return sums.map((s, k) => s / counts[Math.floor(k / 3)]);
  };
  const ca = cells(a);
  const cb = cells(b);
  let sum = 0;
  for (let k = 0; k < ca.length; k++) sum += Math.abs(ca[k] - cb[k]);
  return sum / ca.length;
}

/**
 * The spell cast when the player's words change the world. Orbis needs a chunk
 * (~1.8s) to hear a steer and then time to morph the picture, so the moment the
 * words land, this fills that wait: mist rolls in, the words themselves float
 * up and burst into stars, and the mist clears as the new world arrives.
 */
export function WorldMagic({
  magic,
  onDone,
  world,
}: {
  magic: Magic | null;
  onDone: () => void;
  /** The world's id, for the key of its reveal chimes. */
  world: string;
}) {
  const parts = useMemo(() => (magic ? spell(magic.strength) : null), [magic]);
  const [revealed, setRevealed] = useState<number | null>(null);

  // The moment the words turn into their meaning gets its own little chime.
  useEffect(() => {
    if (!magic?.words || !magic.meaning) return;
    const id = setTimeout(() => playTranslate(world), WORDS_MS[magic.strength] * TURN_AT);
    return () => clearTimeout(id);
  }, [magic, world]);

  useEffect(() => {
    if (!magic) return;

    if (magic.strength !== "big") {
      const id = setTimeout(onDone, MAGIC_MS[magic.strength]);
      return () => clearTimeout(id);
    }

    // Big: hold the mist, watch the world, and clear it when the world moves.
    const video = document.querySelector<HTMLVideoElement>(".world-stage video");
    const read = video ? frameReader(video) : null;
    const before = read?.() ?? null;
    const started = Date.now();
    let changedFor = 0;
    let finish: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      clearInterval(watch);
      setRevealed(magic.id);
      playMagicReveal(world);
      magic.onReveal?.();
      finish = setTimeout(onDone, CLEAR_MS);
    };

    const watch = setInterval(() => {
      const elapsed = Date.now() - started;
      if (elapsed >= REVEAL.maxMs) return reveal();
      // No live picture to watch (rehearsal, or a frame not ready): reveal on time.
      const now = read?.();
      if (!before || !now) {
        if (elapsed >= REVEAL.minMs) reveal();
        return;
      }
      // Two readings in a row, so one flicker of a petal is not a new world.
      changedFor = difference(before, now) > REVEAL.threshold ? changedFor + 1 : 0;
      if (elapsed >= REVEAL.minMs && changedFor >= 2) reveal();
    }, REVEAL.everyMs);

    return () => {
      clearInterval(watch);
      if (finish) clearTimeout(finish);
    };
  }, [magic, onDone, world]);

  if (!magic || !parts) return null;
  const revealing = revealed === magic.id;

  return (
    <div
      className={`magic magic-${magic.strength} ${revealing ? "revealing" : ""}`}
      key={magic.id}
      aria-hidden="true"
    >
      {magic.strength !== "small" && <div className="magic-veil" />}
      {parts.clouds.map((c, i) => (
        <span
          key={`c${i}`}
          className="magic-cloud"
          style={
            {
              "--x": `${c.x}%`,
              "--y": `${c.y}%`,
              "--size": `${c.size}vmax`,
              "--delay": `${c.delay}s`,
              "--dx": `${c.dx}vw`,
              "--dy": `${c.dy}vh`,
              "--peak": c.peak,
            } as CSSProperties
          }
        />
      ))}
      <span className="magic-ring" />
      {magic.words && (
        <span
          className={`magic-words ${magic.meaning ? "turns" : ""}`}
          style={{ "--words-ms": `${WORDS_MS[magic.strength]}ms` } as CSSProperties}
        >
          <span className="magic-jp" lang="ja">
            {magic.words}
          </span>
          {magic.meaning && (
            <span className="magic-en" lang="en">
              {magic.meaning}
            </span>
          )}
        </span>
      )}
      {parts.sparks.map((s, i) => (
        <span
          key={`s${i}`}
          className="magic-spark"
          style={
            {
              "--x": `${s.x}%`,
              "--y": `${s.y}%`,
              "--size": `${s.size}px`,
              "--delay": `${s.delay}s`,
              "--rise": `${s.rise}px`,
              "--tint": s.tint,
              "--dur": `${s.dur}s`,
            } as CSSProperties
          }
        >
          {s.glyph}
        </span>
      ))}
      {magic.strength === "big" && <div className="magic-flash" />}
    </div>
  );
}
