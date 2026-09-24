// Magic, as sound: a twinkle for a learned word, a spell for a world your words
// changed. Synthesised on the spot with the Web Audio API — nothing to load,
// nothing to license — and never the same melody twice. Every note comes from
// one pentatonic scale, so however it is shuffled it still sounds like it
// belongs, the way a music box always does.

export type MagicStrength = "small" | "medium" | "big";

const PENTATONIC = [0, 2, 4, 7, 9];

// Each world has its own key, so its magic has its own tune.
const ROOT: Record<string, number> = {
  park: 72,
  classroom: 77,
  "night-city": 69,
  companion: 79,
  choices: 74,
  freeform: 76,
};

let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;

function context(): { ac: AudioContext; out: AudioNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    // Dry signal plus a small generated hall, into a compressor so a big
    // cascade of bells never clips.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    master.connect(limiter).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = hall(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);

    const input = ctx.createGain();
    input.connect(master);
    input.connect(reverb);
    bus = input;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ac: ctx, out: bus! };
}

/**
 * Browsers only let sound start from a click or a tap. Entering a world is one,
 * so it opens the context there — later spells are cast by the voice, which is
 * not a gesture, and would otherwise play silently.
 */
export function unlockMagic() {
  context();
}

function hall(ac: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const pick = (root: number, step: number) =>
  root + 12 * Math.floor(step / 5) + PENTATONIC[((step % 5) + 5) % 5];

/** A struck bell: a few inharmonic partials, instant attack, long ring. */
function bell(ac: AudioContext, out: AudioNode, t: number, midi: number, peak: number, decay: number) {
  const partials: [number, number][] = [
    [1, 1],
    [2.01, 0.32],
    [3.03, 0.16],
    [4.18, 0.07],
  ];
  for (const [ratio, amp] of partials) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz(midi) * ratio;
    const gain = ac.createGain();
    const ring = decay / Math.sqrt(ratio);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak * amp, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + ring + 0.05);
  }
}

/** The mist rolling in: noise through a bandpass that sweeps upward. */
function whoosh(ac: AudioContext, out: AudioNode, t: number, seconds: number, peak: number) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(320, t);
  band.frequency.exponentialRampToValueAtTime(3600, t + seconds * 0.8);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + seconds * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  noise.connect(band).connect(gain).connect(out);
  noise.start(t);
  noise.stop(t + seconds);
}

/** A soft chord swelling underneath, so the spell has warmth, not just sparkle. */
function pad(ac: AudioContext, out: AudioNode, t: number, notes: number[], seconds: number, peak: number) {
  for (const midi of notes) {
    for (const detune of [-6, 6]) {
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz(midi);
      osc.detune.value = detune;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + seconds * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + seconds + 0.05);
    }
  }
}

/**
 * Plays one piece of magic and returns how long it lasts, in seconds (0 if the
 * browser has no audio). A new melody every call.
 */
export function playMagic(strength: MagicStrength, world = ""): number {
  const audio = context();
  if (!audio) return 0;
  const { ac, out } = audio;
  const root = ROOT[world] ?? 74;
  const t = ac.currentTime + 0.02;
  const rand = (n: number) => Math.floor(Math.random() * n);

  if (strength === "small") {
    // A twinkle: three quick notes up the scale.
    const start = 5 + rand(3);
    [0, 1, 3].forEach((up, i) => bell(ac, out, t + i * 0.07, pick(root, start + up), 0.22, 0.9));
    return 1.1;
  }

  if (strength === "medium") {
    whoosh(ac, out, t, 1.4, 0.09);
    pad(ac, out, t, [root - 12, root - 5, root + 4], 2.8, 0.035);
    // A little rising melody that wanders up the scale, never the same way twice.
    let step = rand(4);
    for (let i = 0; i < 6; i++) {
      bell(ac, out, t + 0.15 + i * 0.1 + Math.random() * 0.02, pick(root, step), 0.2, 1.2);
      step += 1 + rand(2);
    }
    // ...and a sparkle on top as it lands.
    [0, 1, 2].forEach((i) => bell(ac, out, t + 0.95 + i * 0.05, pick(root, step + 3 + i), 0.1, 0.6));
    return 3;
  }

  // Big: the mist rolls in and a melody climbs two octaves over a long, soft
  // chord that carries the wait. The reveal is its own sound (playMagicReveal),
  // played when the world has actually changed — which Orbis takes its own
  // time over.
  whoosh(ac, out, t, 2.2, 0.13);
  pad(ac, out, t, [root - 12, root - 5, root + 2, root + 4], 6, 0.04);
  let step = rand(2);
  for (let i = 0; i < 9; i++) {
    bell(ac, out, t + 0.2 + i * 0.13 + Math.random() * 0.02, pick(root, step), 0.18, 1.4);
    step += 1 + (i % 3 === 2 ? 1 : 0);
  }
  return 2.6;
}

/** The mist clears: a cascade of chimes tumbling down over one deep, warm bell. */
export function playMagicReveal(world = ""): number {
  const audio = context();
  if (!audio) return 0;
  const { ac, out } = audio;
  const root = ROOT[world] ?? 74;
  const t = ac.currentTime + 0.02;
  whoosh(ac, out, t, 0.9, 0.07);
  bell(ac, out, t + 0.25, root - 12, 0.26, 2.6);
  for (let i = 0; i < 10; i++) bell(ac, out, t + 0.25 + i * 0.045, pick(root, 14 - i), 0.11, 0.7);
  return 2.2;
}
