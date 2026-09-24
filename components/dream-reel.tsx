"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DreamMoment } from "@/lib/dream-moments";

import styles from "./dream-reel.module.css";

type Lang = "ja" | "en";
type Word = { word: string; meaning: string };

// A vertical story, the shape phones share: 720×1280 at 30fps, never longer
// than 30 seconds. A title card, one short lesson per key moment, and the words
// learned at the end.
const W = 720;
const H = 1280;
const FPS = 30;
const MAX_S = 30;
const TITLE_S = 2.5;
const OUTRO_S = 3.5;
const MAX_MOMENTS = 6;
/** The world itself, 16:9, in the middle of the frame. */
const BOX = { x: 24, y: 318, w: 672, h: 378, r: 26 };

const FONT_JA = `"Zen Maru Gothic", "Noto Sans JP", sans-serif`;
const FONT_LATIN = `Fredoka, "Zen Maru Gothic", sans-serif`;
const JAPANESE = /[぀-ヿ一-龯]/;
const fontFor = (text: string) => (JAPANESE.test(text) ? FONT_JA : FONT_LATIN);

// Candy sticker, as in the game: a warm fill inside a berry outline.
const CREAM = "#fff3c4";
const BERRY = "#9b3b86";
const GOLD = "#e8bf6a";
const SAKURA = "#ffb3c9";

type Segment = {
  moment: DreamMoment;
  start: number;
  end: number;
  lesson: number;
  video: HTMLVideoElement | null;
  /** How fast to play the clip so all of it fits the segment. */
  rate: number;
  before: HTMLImageElement | null;
  after: HTMLImageElement | null;
  said: { lines: string[]; size: number; font: string };
  meaning: { lines: string[]; size: number; font: string } | null;
  voice: AudioBuffer | null;
  playing: boolean;
};

type Reel = { blob: Blob; url: string; ext: "mp4" | "webm"; poster?: string };

/** Up to six moments, big transformations first, then shown in the order they happened. */
function pick(moments: DreamMoment[]): DreamMoment[] {
  const ranked = [...moments].sort(
    (a, b) => Number(b.strength === "big") - Number(a.strength === "big") || b.at - a.at,
  );
  return ranked.slice(0, MAX_MOMENTS).sort((a, b) => a.at - b.at);
}

/**
 * MP4 first: it is what phones and chat apps play, and unlike MediaRecorder's
 * WebM it knows its own length. WebM (VP8, which keeps up in real time where
 * VP9 can fall behind) is the fallback where MP4 cannot be recorded.
 */
function reelMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const options: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
    ["video/mp4;codecs=avc1,mp4a", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ];
  const found = options.find(([m]) => MediaRecorder.isTypeSupported(m));
  return found ? { mime: found[0], ext: found[1] } : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3;
/** Rises past 1 and settles: the pop of a sticker landing. */
const pop = (x: number) => {
  const t = clamp(x, 0, 1);
  return t < 0.6 ? 0.6 + (t / 0.6) * 0.52 : 1.12 - ((t - 0.6) / 0.4) * 0.12;
};

function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A hidden, muted player for a moment's clip, ready to draw from. */
function loadClip(clip: Blob | undefined, host: HTMLElement, urls: string[]): Promise<HTMLVideoElement | null> {
  if (!clip) return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(clip);
    urls.push(url);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok ? video : null);
    };
    const timer = setTimeout(() => done(video.readyState >= 2), 5000);
    video.onloadeddata = () => done(true);
    video.onerror = () => done(false);
    host.appendChild(video);
    video.src = url;
  });
}

async function loadVoice(ac: AudioContext, text: string, lang: Lang): Promise<AudioBuffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await ac.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Breaks text to fit a width, shrinking the font until it fits in `maxLines`. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, maxLines: number) {
  const font = fontFor(text);
  for (let s = size; ; s -= 4) {
    ctx.font = `700 ${s}px ${font}`;
    const japanese = JAPANESE.test(text) && !/\s/.test(text.trim());
    const units = japanese ? [...text] : text.split(/(\s+)/);
    const lines: string[] = [];
    let line = "";
    for (const unit of units) {
      const next = line + unit;
      if (line && ctx.measureText(next.trim()).width > maxWidth) {
        lines.push(line.trim());
        line = unit.trimStart();
      } else line = next;
    }
    if (line.trim()) lines.push(line.trim());
    if (lines.length <= maxLines || s <= 24) return { lines, size: s, font };
  }
}

function sticker(
  ctx: CanvasRenderingContext2D,
  text: { lines: string[]; size: number; font: string },
  x: number,
  y: number,
  { scale = 1, alpha = 1, fill = CREAM, weight = 700 } = {},
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `${weight} ${text.size}px ${text.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const step = text.size * 1.2;
  const top = -((text.lines.length - 1) * step) / 2;
  ctx.lineWidth = Math.max(4, text.size * 0.17);
  ctx.strokeStyle = BERRY;
  ctx.shadowColor = "rgba(70, 18, 70, 0.55)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  text.lines.forEach((l, i) => ctx.strokeText(l, 0, top + i * step));
  ctx.shadowColor = "transparent";
  ctx.fillStyle = fill;
  text.lines.forEach((l, i) => ctx.fillText(l, 0, top + i * step));
  ctx.restore();
}

function softText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, alpha = 1, weight = 500) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${fontFor(text)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws a source to cover a rectangle, cropping the overflow, with an optional slow zoom. */
function cover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
) {
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function sourceSize(src: HTMLVideoElement | HTMLImageElement): [number, number] {
  return src instanceof HTMLVideoElement ? [src.videoWidth, src.videoHeight] : [src.naturalWidth, src.naturalHeight];
}

// ---- Music ------------------------------------------------------------------

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const PENTATONIC = [0, 2, 4, 7, 9];
const scaleNote = (root: number, step: number) => root + 12 * Math.floor(step / 5) + PENTATONIC[((step % 5) + 5) % 5];

function bell(ac: AudioContext, out: AudioNode, t: number, midi: number, peak: number, decay: number) {
  for (const [ratio, amp] of [
    [1, 1],
    [2.01, 0.3],
    [3.02, 0.12],
  ] as const) {
    const osc = ac.createOscillator();
    osc.frequency.value = hz(midi) * ratio;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak * amp, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(ratio));
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

/** A soft bed for the whole reel: slow chords and a wandering music box, never the same twice. */
function music(ac: AudioContext, out: AudioNode, t0: number, total: number, chimes: number[]) {
  const root = 62 + Math.floor(Math.random() * 4);
  const bed = ac.createGain();
  bed.gain.setValueAtTime(0, t0);
  bed.gain.linearRampToValueAtTime(1, t0 + 1.2);
  bed.gain.setValueAtTime(1, t0 + total - 1.4);
  bed.gain.linearRampToValueAtTime(0, t0 + total);
  bed.connect(out);

  const chords = [
    [0, 4, 7],
    [-3, 0, 4],
    [-7, -3, 0],
    [-5, -1, 2],
  ];
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.connect(bed);
  for (let t = 0, i = 0; t < total; t += 4, i++) {
    for (const n of chords[i % chords.length]) {
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz(root - 12 + n);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t0 + t);
      g.gain.linearRampToValueAtTime(0.028, t0 + t + 1.2);
      g.gain.linearRampToValueAtTime(0, t0 + t + 4.4);
      osc.connect(g).connect(filter);
      osc.start(t0 + t);
      osc.stop(t0 + t + 4.5);
    }
  }
  let step = Math.floor(Math.random() * 5);
  for (let t = 0.4; t < total - 1; t += 0.5) {
    bell(ac, bed, t0 + t + Math.random() * 0.03, scaleNote(root, step), 0.045, 1.3);
    step += [-1, 1, 1, 2, -2][Math.floor(Math.random() * 5)];
    step = clamp(step, 3, 12);
  }
  for (const c of chimes) [0, 1, 2, 3].forEach((i) => bell(ac, bed, t0 + c + i * 0.06, scaleNote(root, 10 + i), 0.09, 0.9));
}

// ---- The reel ----------------------------------------------------------------

type Job = { cancelled: boolean };

async function compose(
  input: { moments: DreamMoment[]; title: string; lang: Lang; words: Word[] },
  host: HTMLElement,
  job: Job,
  onProgress: (p: number) => void,
): Promise<Reel | null> {
  const format = reelMime();
  if (!format) throw new Error("This browser cannot record video.");
  const chosen = pick(input.moments);
  const per = clamp((MAX_S - TITLE_S - OUTRO_S) / Math.max(1, chosen.length), 3.5, 4.5);
  const total = TITLE_S + chosen.length * per + OUTRO_S;

  const urls: string[] = [];
  const ac = new AudioContext();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas.");
  let recorder: MediaRecorder | null = null;
  const segments: Segment[] = [];

  const cleanup = () => {
    for (const s of segments) s.video?.pause();
    host.replaceChildren();
    for (const u of urls) URL.revokeObjectURL(u);
    void ac.close().catch(() => {});
  };

  try {
    // Fonts first: a canvas draws with whatever is loaded at that moment.
    const texts = [input.title, ...chosen.flatMap((m) => [m.said, m.meaning ?? ""]), ...input.words.flatMap((w) => [w.word, w.meaning])];
    const all = texts.join("");
    await Promise.all(
      [`700 64px ${FONT_JA}`, `700 64px ${FONT_LATIN}`, `500 32px ${FONT_LATIN}`, `600 26px ${FONT_LATIN}`].map((f) =>
        document.fonts.load(f, all || "Yume").catch(() => []),
      ),
    );
    onProgress(0.03);

    const loaded = await Promise.all(
      chosen.map(async (m) => {
        const [video, before, after, voice] = await Promise.all([
          loadClip(m.clip, host, urls),
          loadImage(m.before),
          loadImage(m.after),
          loadVoice(ac, m.said, input.lang),
        ]);
        return { m, video, before, after, voice };
      }),
    );
    if (job.cancelled) return null;
    onProgress(0.1);

    loaded.forEach(({ m, video, before, after, voice }, i) => {
      const start = TITLE_S + i * per;
      const clipS = (m.clipMs ?? (m.strength === "big" ? 10_000 : 7000)) / 1000;
      segments.push({
        moment: m,
        start,
        end: start + per,
        lesson: i + 1,
        video,
        rate: clamp(clipS / (per - 0.2), 1, 3),
        before,
        after,
        said: fit(ctx, m.said, W - 80, JAPANESE.test(m.said) ? 64 : 60, 3),
        meaning: m.meaning ? fit(ctx, m.meaning, W - 110, 34, 2) : null,
        voice,
        playing: false,
      });
    });

    const heading = fit(ctx, "A Yume dream", W - 80, 78, 1);
    const titleText = fit(ctx, input.title, W - 120, 40, 2);
    const learned = (input.words.length
      ? input.words
      : chosen.map((m) => ({ word: m.said, meaning: m.meaning ?? "" }))
    ).slice(0, 6);
    const learnedRows = learned.map((w) => ({
      word: fit(ctx, w.word, W - 120, 46, 1),
      meaning: w.meaning,
    }));
    const closing =
      input.lang === "en"
        ? { en: "Say it in English, and the world changes.", kana: "えいごで いえば、せかいが かわる" }
        : { en: "Say it in Japanese, and the world changes.", kana: "にほんごで いえば、せかいが かわる" };

    // Sparkles drifting up the whole frame, fixed in advance so drawing stays cheap.
    const sparks = Array.from({ length: 34 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 2 + Math.random() * 4,
      speed: 12 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      tint: [CREAM, SAKURA, GOLD, "#b9a2ff", "#86ccff"][Math.floor(Math.random() * 5)],
    }));

    const drawSparks = (t: number, burst = 0) => {
      for (const s of sparks) {
        const y = (((s.y - t * s.speed) % H) + H) % H;
        const a = 0.35 + 0.45 * Math.sin(t * 2.2 + s.phase) ** 2 + burst * 0.4;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = s.tint;
        const r = s.r * (1 + burst);
        ctx.beginPath();
        ctx.moveTo(s.x, y - r * 2);
        ctx.lineTo(s.x + r * 0.5, y - r * 0.5);
        ctx.lineTo(s.x + r * 2, y);
        ctx.lineTo(s.x + r * 0.5, y + r * 0.5);
        ctx.lineTo(s.x, y + r * 2);
        ctx.lineTo(s.x - r * 0.5, y + r * 0.5);
        ctx.lineTo(s.x - r * 2, y);
        ctx.lineTo(s.x - r * 0.5, y - r * 0.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const backdrop = (src: HTMLVideoElement | HTMLImageElement | null, t: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1b1030");
      g.addColorStop(0.55, "#2a1333");
      g.addColorStop(1, "#0c0812");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (src) {
        const [sw, sh] = sourceSize(src);
        ctx.globalAlpha = 0.5;
        cover(ctx, src, sw, sh, 0, 0, W, H, 1.05 + t * 0.01);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(14, 8, 24, 0.55)";
        ctx.fillRect(0, 0, W, H);
      }
    };

    const mark = (alpha = 0.85) => {
      softText(ctx, "Yume 夢", W / 2, H - 70, 30, CREAM, alpha, 600);
    };

    const drawTitle = (t: number) => {
      const first = segments[0];
      backdrop(first?.before ?? first?.after ?? null, t);
      drawSparks(t, Math.max(0, 1 - t * 1.4));
      const inT = ease(t / 0.7);
      sticker(ctx, heading, W / 2, H * 0.42, { scale: pop(t / 0.7), alpha: inT });
      softText(ctx, "✦", W / 2, H * 0.34, 54, GOLD, inT, 700);
      titleText.lines.forEach((l, i) =>
        softText(ctx, l, W / 2, H * 0.5 + i * 48, titleText.size, CREAM, ease((t - 0.5) / 0.6)),
      );
      mark(ease((t - 0.8) / 0.6));
    };

    const drawMoment = (s: Segment, local: number) => {
      const p = local / per;
      const media = s.video && s.video.readyState >= 2 ? s.video : null;
      const still = p < 0.5 ? (s.before ?? s.after) : (s.after ?? s.before);
      backdrop(media ?? still, local);
      drawSparks(local + s.start, Math.max(0, 1 - local * 3));

      // The chip: which lesson this is.
      const chipIn = ease(local / 0.4);
      ctx.save();
      ctx.globalAlpha = chipIn;
      ctx.font = `600 26px ${FONT_LATIN}`;
      const label = `LESSON ${s.lesson}`;
      const cw = ctx.measureText(label).width + 44;
      roundRect(ctx, (W - cw) / 2, 212 - (1 - chipIn) * 20, cw, 50, 25);
      ctx.fillStyle = "rgba(20, 12, 22, 0.72)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, W / 2, 238 - (1 - chipIn) * 20);
      ctx.restore();

      // The world: the clip if there is one, else its stills crossfading with a slow zoom.
      ctx.save();
      ctx.shadowColor = "rgba(255, 190, 120, 0.55)";
      ctx.shadowBlur = 30;
      roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, BOX.r);
      ctx.fillStyle = "#120c16";
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, BOX.r);
      ctx.clip();
      if (media) {
        cover(ctx, media, media.videoWidth, media.videoHeight, BOX.x, BOX.y, BOX.w, BOX.h);
      } else {
        const zoom = 1 + p * 0.1;
        if (s.before) cover(ctx, s.before, ...sourceSize(s.before), BOX.x, BOX.y, BOX.w, BOX.h, zoom);
        if (s.after) {
          ctx.globalAlpha = s.before ? ease((p - 0.35) / 0.3) : 1;
          cover(ctx, s.after, ...sourceSize(s.after), BOX.x, BOX.y, BOX.w, BOX.h, zoom);
          ctx.globalAlpha = 1;
        }
        if (!s.before && !s.after) drawSparks(local * 2, 0.5);
      }
      ctx.restore();
      ctx.save();
      roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, BOX.r);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 243, 196, 0.55)";
      ctx.stroke();
      ctx.restore();

      // The words, landing like a sticker, and what they mean.
      const wordsY = BOX.y + BOX.h + 60 + (s.said.lines.length * s.said.size * 1.2) / 2;
      sticker(ctx, s.said, W / 2, wordsY, { scale: pop((local - 0.25) / 0.55), alpha: ease((local - 0.25) / 0.3) });
      if (s.meaning) {
        const my = wordsY + (s.said.lines.length * s.said.size * 1.2) / 2 + 40;
        s.meaning.lines.forEach((l, i) =>
          softText(ctx, l, W / 2, my + i * s.meaning!.size * 1.25, s.meaning!.size, SAKURA, ease((local - 0.8) / 0.4)),
        );
      }
      mark();

      // A flash of light as each lesson begins.
      if (local < 0.35) {
        ctx.fillStyle = `rgba(255, 246, 220, ${0.45 * (1 - local / 0.35)})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const drawOutro = (local: number) => {
      const last = segments.at(-1);
      backdrop(last?.after ?? last?.before ?? null, local);
      drawSparks(local + total, Math.max(0, 1 - local * 2));
      sticker(ctx, fit(ctx, "Words you learned", W - 80, 58, 1), W / 2, 250, {
        scale: pop(local / 0.5),
        alpha: ease(local / 0.4),
      });
      learnedRows.forEach((row, i) => {
        const y = 390 + i * 104;
        const a = ease((local - 0.3 - i * 0.18) / 0.35);
        sticker(ctx, row.word, W / 2, y, { alpha: a, scale: 0.9 + 0.1 * a });
        softText(ctx, row.meaning, W / 2, y + 44, 28, SAKURA, a);
      });
      const cy = Math.min(H - 250, 420 + learnedRows.length * 104);
      softText(ctx, closing.en, W / 2, cy, 30, CREAM, ease((local - 1.2) / 0.5), 600);
      softText(ctx, closing.kana, W / 2, cy + 46, 26, GOLD, ease((local - 1.4) / 0.5), 500);
      mark(ease((local - 1.6) / 0.5));
      if (local > OUTRO_S - 0.5) {
        ctx.fillStyle = `rgba(0, 0, 0, ${ease((local - (OUTRO_S - 0.5)) / 0.5) * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const draw = (t: number) => {
      if (t < TITLE_S) return drawTitle(t);
      const s = segments.find((seg) => t >= seg.start && t < seg.end);
      if (s) return drawMoment(s, t - s.start);
      drawOutro(t - (TITLE_S + segments.length * per));
    };

    // Picture and sound, one stream, recorded as it plays. Without a click on
    // the page first, a browser may refuse to start audio; then the reel is
    // silent rather than stuck waiting for sound that never comes.
    await Promise.race([ac.resume().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
    const dest = ac.createMediaStreamDestination();
    const master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(dest);
    draw(0);
    const audio = ac.state === "running" ? dest.stream.getAudioTracks() : [];
    const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...audio]);
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
    const rec = recorder;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    rec.start(1000);

    const a0 = ac.currentTime + 0.05;
    const t0 = performance.now() + 50;
    music(ac, master, a0, total, segments.map((s) => s.start));
    for (const s of segments) {
      if (!s.voice) continue;
      const src = ac.createBufferSource();
      src.buffer = s.voice;
      const g = ac.createGain();
      g.gain.value = 1.1;
      src.connect(g).connect(master);
      src.start(a0 + s.start + 0.6);
      src.stop(a0 + s.end - 0.05);
    }

    let poster: string | undefined;
    await new Promise<void>((resolve) => {
      let lastProgress = 0;
      const frame = () => {
        if (job.cancelled) return resolve();
        const t = Math.max(0, (performance.now() - t0) / 1000);
        // Clips start a beat early, so their first frame is ready when the lesson begins.
        for (const s of segments) {
          if (!s.video) continue;
          const on = t >= s.start - 0.3 && t < s.end;
          if (on && !s.playing) {
            s.playing = true;
            s.video.currentTime = 0;
            s.video.playbackRate = s.rate;
            void s.video.play().catch(() => {});
          } else if (!on && s.playing && t >= s.end) {
            s.playing = false;
            s.video.pause();
          }
        }
        draw(Math.min(t, total - 0.001));
        // The preview's thumbnail: the title card once it has fully appeared.
        if (!poster && t >= 1.6) poster = canvas.toDataURL("image/jpeg", 0.8);
        if (t - lastProgress > 0.25) {
          lastProgress = t;
          onProgress(0.1 + 0.9 * clamp(t / total, 0, 1));
        }
        if (t >= total) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    // A few more frames of the last picture, so the ending is not clipped.
    await new Promise((r) => setTimeout(r, 200));
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    if (job.cancelled || !chunks.length) return null;
    const blob = new Blob(chunks, { type: format.mime.split(";")[0] });
    return { blob, url: URL.createObjectURL(blob), ext: format.ext, poster };
  } finally {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    cleanup();
  }
}

/**
 * The session as a short story to keep and share: the moments the player's
 * words changed the world, each a tiny lesson — the world changing, the words
 * that did it and what they mean, spoken aloud — ending on the words learned.
 * Made in the browser, in real time, the moment the dream ends.
 */
export function DreamReel({
  moments,
  title,
  lang,
  words,
}: {
  moments: DreamMoment[];
  title: string;
  lang: Lang;
  words: Word[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"making" | "done" | "failed">("making");
  const [progress, setProgress] = useState(0);
  const [reel, setReel] = useState<Reel | null>(null);
  const [error, setError] = useState("");
  const [run, setRun] = useState(0);
  const has = moments.length > 0;

  // The reel is remade when what it shows changes, not whenever the parent
  // happens to pass new arrays with the same moments in them.
  const latest = useRef({ moments, title, lang, words });
  useEffect(() => {
    latest.current = { moments, title, lang, words };
  });
  const key = [
    moments.map((m) => `${m.id}:${m.clip?.size ?? 0}:${m.after ? 1 : 0}`).join(","),
    title,
    lang,
    words.map((w) => w.word).join(","),
  ].join("|");

  useEffect(() => {
    if (!has || !hostRef.current) return;
    const job: Job = { cancelled: false };
    let made: Reel | null = null;
    setState("making");
    setProgress(0);
    setReel(null);
    compose(latest.current, hostRef.current, job, setProgress)
      .then((r) => {
        if (job.cancelled) {
          if (r) URL.revokeObjectURL(r.url);
          return;
        }
        made = r;
        setReel(r);
        setState(r ? "done" : "failed");
      })
      .catch((e: unknown) => {
        if (job.cancelled) return;
        setError(e instanceof Error ? e.message : "");
        setState("failed");
      });
    return () => {
      job.cancelled = true;
      if (made) URL.revokeObjectURL(made.url);
    };
  }, [has, key, run]);

  // A hidden tab stops the animation the reel is recorded from, which would
  // leave it stalled or with a hole in it. If that happens mid-reel, start
  // over once the player is back.
  useEffect(() => {
    if (state !== "making") return;
    let hid = false;
    const onVisibility = () => {
      if (document.hidden) hid = true;
      else if (hid) {
        hid = false;
        setRun((r) => r + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state]);

  const file = useMemo(
    () => (reel ? new File([reel.blob], `yume-dream.${reel.ext}`, { type: reel.blob.type }) : null),
    [reel],
  );
  const canShare =
    !!file && typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });

  const share = () => {
    if (!file) return;
    void navigator
      .share({ files: [file], title: "My Yume dream", text: `I changed a whole world with my words in Yume ✨` })
      .catch(() => {});
  };

  return (
    <section className={styles.reel} aria-label="Your dream reel">
      <div className={styles.head}>
        <span className={styles.kicker}>Your dream reel</span>
        <span className={styles.sub}>A little movie of the moments your words changed the world.</span>
      </div>

      {!has ? (
        <p className={styles.empty}>
          Your reel appears here once your words change the world. Say something, and watch it happen!
        </p>
      ) : (
        <div className={styles.stage}>
          {state === "making" && (
            <div className={styles.making} role="status">
              <span className={styles.wand} aria-hidden="true">
                ✦
              </span>
              <span className={styles.makingText}>Making your dream reel…</span>
              <span className={styles.bar}>
                <span className={styles.fill} style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
              <span className={styles.percent}>{Math.round(progress * 100)}%</span>
            </div>
          )}
          {state === "done" && reel && (
            <>
              <video className={styles.preview} src={reel.url} poster={reel.poster} controls playsInline />
              <div className={styles.actions}>
                {canShare && (
                  <button type="button" className={styles.primary} onClick={share}>
                    Share
                  </button>
                )}
                <a className={canShare ? styles.secondary : styles.primary} href={reel.url} download={`yume-dream.${reel.ext}`}>
                  Download
                </a>
                <button type="button" className={styles.secondary} onClick={() => setRun((r) => r + 1)}>
                  Make it again
                </button>
              </div>
            </>
          )}
          {state === "failed" && (
            <div className={styles.making}>
              <span className={styles.makingText}>The reel could not be made here.</span>
              {error && <span className={styles.percent}>{error}</span>}
              <button type="button" className={styles.secondary} onClick={() => setRun((r) => r + 1)}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {has && (
        <div className={styles.memories}>
          <span className={styles.kicker}>Memories</span>
          <ol className={styles.strip}>
            {moments.map((m) => {
              const pic = m.after ?? m.before;
              return (
                <li key={m.id} className={styles.card}>
                  {pic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.pic} src={pic} alt="" />
                  ) : (
                    <span className={styles.pic} aria-hidden="true">
                      ✦
                    </span>
                  )}
                  <span className={styles.said} lang={JAPANESE.test(m.said) ? "ja" : "en"}>
                    {m.said}
                  </span>
                  {m.meaning && <span className={styles.meaning}>{m.meaning}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Where the clips play while the reel is being made. */}
      <div ref={hostRef} className={styles.host} aria-hidden="true" />
    </section>
  );
}
