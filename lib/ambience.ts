// The world's own sound. Orbis streams pictures, not audio, and a silent world
// feels like a window rather than a place — so this plays what the scene would
// sound like underneath it: waves on an island, birds in a park by day and
// crickets there at night, rain, a distant city, a crackling campfire.
//
// Everything is synthesised with the Web Audio API from a few seconds of
// generated noise and plain oscillators: nothing to load, nothing to license.
// Continuous layers (wind, surf, rain) are filtered noise shaped by slow
// automation; sparse ones (a bird, a cricket's chirp, a firework far away) are
// scheduled a little ahead of time by one timer, never per frame. It stays
// well under the voices and the magic, because a child hears it for minutes.

/** One strand of the ambience. Levels are 0-1, relative to that strand's own natural loudness. */
export type AmbienceLayer =
  | "wind"
  | "waves"
  | "gulls"
  | "birds"
  | "crickets"
  | "rain"
  | "city"
  | "fire"
  | "fireworks"
  | "bubbles"
  | "whale"
  | "shimmer";

export type AmbiencePreset = {
  /** A short label, e.g. "sea night", for logs and tests. */
  name: string;
  night: boolean;
  layers: Partial<Record<AmbienceLayer, number>>;
};

// ---- Choosing what a scene sounds like ------------------------------------------

const has = (text: string, pattern: RegExp) => pattern.test(text);

/** Where the last match of a pattern starts, or -1. */
function lastIndex(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let at = -1;
  for (const m of text.matchAll(global)) at = m.index ?? at;
  return at;
}

const NIGHT = /\b(night|nighttime|midnight|moon|moonlit|moonlight|stars?|starry|starlit|dusk|twilight|dark sky|evening)\b/;
const DAY = /\b(day|daytime|daylight|sunny|sunlit|sunlight|sunshine|morning|sunrise|dawn|noon|afternoon|golden hour|sunset|blue sky|midday)\b/;

/**
 * Picks the ambience for an English scene description — the same text Orbis is
 * prompted with. The scene grows as the story goes on, so day and night are
 * decided by whichever was mentioned LAST: "golden hour … night falls" is night,
 * and "a starry night … morning comes" is day again.
 */
export function sceneAmbience(description: string): AmbiencePreset {
  const text = description.toLowerCase();
  const night = lastIndex(text, NIGHT) > lastIndex(text, DAY);

  const underwater = has(text, /\b(underwater|under the sea|under water|beneath the waves|coral reef|seabed|sea floor|ocean floor|deep sea)\b/);
  const sea = has(text, /\b(sea|ocean|beach|island|lighthouse|boat|ship|shore|seashore|waves?|harbou?r|coast|bay|lagoon|surf|pier)\b/);
  const nature = has(text, /\b(park|forest|garden|cherry|blossoms?|trees?|meadow|field|grass|woods|jungle|mountains?|hills?|lake|river|valley|flowers?|countryside|shrine)\b/);
  const city = has(text, /\b(city|street|streets|town|neon|rooftops?|alley|buildings?|traffic|station|skyline|downtown)\b/);
  // "rain-slick" and "rain-soaked" streets are wet, not rainy.
  const rain = has(text, /\b(rain(?![-\w])|raining|rainy|drizzle|storm|stormy|downpour|raindrops)\b/) && !has(text, /\b(rain stops|rain ends|stops raining)\b/);
  const fireworks = has(text, /\bfireworks?\b/);
  const indoors = has(text, /\b(classroom|school|library|room|indoors|inside|house|cafe|kitchen|bedroom|hall)\b/);
  const fire = has(text, /\b(campfire|bonfire|fireplace|fire|hearth|torch|torches|candle|candles|lanterns?)\b/);

  const layers: Partial<Record<AmbienceLayer, number>> = { shimmer: 0.35 };
  const parts: string[] = [];

  if (underwater) {
    layers.bubbles = 1;
    layers.whale = 0.8;
    parts.push("underwater");
  } else {
    layers.wind = night ? 0.35 : 0.45;
    if (sea) {
      layers.waves = 1;
      layers.wind = night ? 0.35 : 0.5;
      if (!night && !rain) layers.gulls = 0.55;
      if (night) layers.crickets = 0.3;
      parts.push("sea");
    }
    if (nature) {
      if (night) layers.crickets = 1;
      else if (!rain) layers.birds = 1;
      layers.wind = Math.max(layers.wind ?? 0, night ? 0.35 : 0.6);
      parts.push("park");
    }
    if (city) {
      layers.city = 1;
      if (night) layers.crickets = Math.max(layers.crickets ?? 0, 0.2);
      else if (!rain && !layers.birds) layers.birds = 0.25;
      parts.push("city");
    }
    if (!sea && !nature && !city) {
      if (indoors) {
        // Inside: no wind, just the world faintly through a window.
        delete layers.wind;
        if (night) layers.crickets = 0.2;
        else if (!rain) layers.birds = 0.2;
        parts.push("indoors");
      } else if (night) {
        // Somewhere we have no word for: a soft outdoor air, and the season's creatures.
        layers.crickets = 0.5;
      } else if (!rain) layers.birds = 0.4;
    }
    if (rain) {
      layers.rain = 1;
      delete layers.birds;
      delete layers.gulls;
      if (layers.crickets) layers.crickets = Math.min(layers.crickets, 0.3);
      parts.push("rain");
    }
    if (fireworks) {
      layers.fireworks = 1;
      parts.push("fireworks");
    }
    if (fire) {
      layers.fire = has(text, /\b(campfire|bonfire|fireplace|hearth|\bfire\b)\b/) ? 1 : 0.4;
      parts.push("fire");
    }
  }

  return { name: [...(parts.length ? parts : ["outdoors"]), night ? "night" : "day"].join(" "), night, layers };
}

// ---- Noise, generated once per context ---------------------------------------------

type Ctx = BaseAudioContext;
type Noise = "white" | "pink" | "brown";

const noiseCache = new WeakMap<Ctx, Map<Noise, AudioBuffer>>();

/**
 * Six seconds of stereo noise, normalised so every colour sits at the same
 * loudness. Each channel is drawn separately, so a looped source is wide, not
 * a point in the middle; six seconds is long enough that the loop is never heard.
 */
function noise(ctx: Ctx, color: Noise): AudioBuffer {
  let byColor = noiseCache.get(ctx);
  if (!byColor) noiseCache.set(ctx, (byColor = new Map()));
  const cached = byColor.get(color);
  if (cached) return cached;

  const length = Math.floor(ctx.sampleRate * 6);
  // A little extra is drawn past the end and crossfaded into the start, so the
  // loop's last sample flows straight into its first: no seam, no click, even
  // in brown noise, which wanders far enough to click at a hard cut.
  const fade = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const raw = new Float32Array(length + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === "white") raw[i] = white;
      else if (color === "pink") {
        // Paul Kellet's refined pink filter.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        raw[i] = last;
      }
    }
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) d[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const w = (i / fade) * (Math.PI / 2);
      d[i] = raw[i] * Math.sin(w) + raw[length + i] * Math.cos(w);
    }
    // Remove any DC and normalise to an RMS of 0.2.
    let mean = 0;
    for (let i = 0; i < length; i++) mean += d[i];
    mean /= length;
    let sq = 0;
    for (let i = 0; i < length; i++) {
      d[i] -= mean;
      sq += d[i] * d[i];
    }
    const scale = 0.2 / Math.sqrt(sq / length || 1);
    for (let i = 0; i < length; i++) d[i] *= scale;
  }
  byColor.set(color, buffer);
  return buffer;
}

// ---- Building blocks ---------------------------------------------------------------

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/**
 * One strand, running. `until` schedules its events up to an audio time;
 * continuous strands have none. `now` lets a strand skip what it missed: a
 * hidden tab's timers sleep, and waking up must not release a minute of birds
 * at once.
 */
type Strand = { until(t: number, now?: number): void; stop(at: number): void };

type Kit = {
  ctx: Ctx;
  out: AudioNode;
  sources: AudioScheduledSourceNode[];
};

function loop(kit: Kit, color: Noise, at: number): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource();
  src.buffer = noise(kit.ctx, color);
  src.loop = true;
  // A random start point, so two strands of the same colour never line up.
  src.start(at, rand(0, 5));
  kit.sources.push(src);
  return src;
}

function filter(kit: Kit, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = kit.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

function gain(kit: Kit, value: number): GainNode {
  const g = kit.ctx.createGain();
  g.gain.value = value;
  return g;
}

function pan(kit: Kit, value: number): AudioNode {
  if (!("createStereoPanner" in kit.ctx)) return gain(kit, 1);
  const p = kit.ctx.createStereoPanner();
  p.pan.value = value;
  return p;
}

/** A slow wobble on a parameter: an oscillator into a gain into the param. */
function lfo(kit: Kit, param: AudioParam, rate: number, depth: number, at: number) {
  const osc = kit.ctx.createOscillator();
  osc.frequency.value = rate;
  const g = gain(kit, depth);
  osc.connect(g).connect(param);
  osc.start(at);
  kit.sources.push(osc);
}

/** A short burst of noise through a band-pass: the stuff of crackles, drips and pops. */
function burst(kit: Kit, out: AudioNode, t: number, o: { freq: number; q: number; dur: number; amp: number; color?: Noise; pan?: number; type?: BiquadFilterType }) {
  const src = kit.ctx.createBufferSource();
  src.buffer = noise(kit.ctx, o.color ?? "white");
  const f = filter(kit, o.type ?? "bandpass", o.freq, o.q);
  const g = gain(kit, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.amp, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let dest: AudioNode = out;
  if (o.pan !== undefined) {
    dest = pan(kit, o.pan);
    dest.connect(out);
  }
  src.connect(f).connect(g).connect(dest);
  src.start(t, rand(0, 5), o.dur + 0.05);
}

/** A tone with its own pitch path and envelope — a chirp, a gull, a bubble, a twinkle. */
function tone(
  kit: Kit,
  out: AudioNode,
  t: number,
  o: {
    type?: OscillatorType;
    freqs: [number, number][]; // [time offset, frequency], exponential glides between
    attack: number;
    hold: number;
    release: number;
    amp: number;
    pan?: number;
    lowpass?: number;
    bandpass?: [number, number];
  },
) {
  const osc = kit.ctx.createOscillator();
  osc.type = o.type ?? "sine";
  const [first, ...rest] = o.freqs;
  osc.frequency.setValueAtTime(first[1], t + first[0]);
  for (const [dt, f] of rest) osc.frequency.exponentialRampToValueAtTime(f, t + dt);
  const g = gain(kit, 0);
  const end = t + o.attack + o.hold + o.release;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.amp, t + o.attack);
  g.gain.setValueAtTime(o.amp, t + o.attack + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  let node: AudioNode = osc;
  if (o.lowpass) node = node.connect(filter(kit, "lowpass", o.lowpass));
  if (o.bandpass) node = node.connect(filter(kit, "bandpass", o.bandpass[0], o.bandpass[1]));
  node.connect(g);
  const p = o.pan === undefined ? null : pan(kit, o.pan);
  if (p) g.connect(p).connect(out);
  else g.connect(out);
  osc.start(t);
  osc.stop(end + 0.05);
}

/** Calls `event(t)` at random intervals, scheduling only as far ahead as it is asked to. */
function sparse(start: number, gap: () => number, event: (t: number) => void): Strand {
  let next = start + gap() * rand(0.2, 1);
  return {
    until(t, now = 0) {
      if (next < now - 0.25) next = now + gap() * rand(0.1, 0.5);
      while (next < t) {
        event(next);
        next += gap();
      }
    },
    stop() {
      next = Infinity;
    },
  };
}

const quiet: Strand = { until() {}, stop() {} };

// ---- The strands -----------------------------------------------------------------------

/** A breeze: brown noise under a low-pass that slowly opens and closes, in gusts. */
function wind(kit: Kit, level: number, at: number): Strand {
  const f = filter(kit, "lowpass", 520, 0.4);
  const g = gain(kit, 0.3 * level);
  loop(kit, "brown", at).connect(filter(kit, "highpass", 70, 0.5)).connect(f).connect(g).connect(kit.out);
  lfo(kit, f.frequency, 0.045, 260, at);
  lfo(kit, g.gain, 0.11, 0.13 * level, at);
  return quiet;
}

/**
 * Surf: a low roll of pink noise that swells as each wave comes in, and a
 * brighter wash of white noise as it breaks and runs back out.
 */
function waves(kit: Kit, level: number, at: number): Strand {
  const base = 0.15 * level;
  const rumbleF = filter(kit, "lowpass", 520, 0.5);
  const rumble = gain(kit, base);
  loop(kit, "pink", at).connect(filter(kit, "highpass", 60, 0.5)).connect(rumbleF).connect(rumble).connect(kit.out);
  const washF = filter(kit, "bandpass", 1700, 0.6);
  const wash = gain(kit, 0.0001);
  loop(kit, "white", at).connect(washF).connect(wash).connect(pan(kit, rand(-0.3, 0.3))).connect(kit.out);

  let next = at + rand(0, 2);
  return {
    until(t, now = 0) {
      if (next < now - 0.25) next = now;
      while (next < t) {
        const period = rand(7, 11);
        const start = next;
        const peak = start + period * rand(0.5, 0.6);
        const size = rand(0.7, 1);
        rumble.gain.setValueAtTime(base, start);
        rumble.gain.linearRampToValueAtTime(base * (2.2 + 1.2 * size), peak);
        rumble.gain.exponentialRampToValueAtTime(base * 1.15, peak + (start + period - peak) * 0.7);
        rumble.gain.linearRampToValueAtTime(base, start + period);
        wash.gain.setValueAtTime(0.0001, peak - 0.5);
        wash.gain.exponentialRampToValueAtTime(0.16 * level * size, peak + 0.2);
        wash.gain.exponentialRampToValueAtTime(0.0001, peak + rand(2.4, 3.2));
        next = start + period;
      }
    },
    stop() {
      next = Infinity;
    },
  };
}

/** Gulls, far off: a nasal "kyow" that slides down, two to four at a time. */
function gulls(kit: Kit, level: number, at: number): Strand {
  return sparse(at, () => rand(6, 14), (t) => {
    const side = rand(-0.8, 0.8);
    const calls = Math.floor(rand(2, 5));
    let s = t;
    for (let i = 0; i < calls; i++) {
      const top = rand(1700, 2100);
      tone(kit, kit.out, s, {
        type: "sawtooth",
        freqs: [[0, top * 0.85], [0.05, top], [0.3, top * 0.66]],
        attack: 0.04,
        hold: 0.1,
        release: 0.2,
        amp: 0.04 * level,
        pan: side,
        bandpass: [1500, 2.5],
      });
      s += rand(0.32, 0.5);
    }
  });
}

/** Songbirds: little trills, whistles and tweets from all around, never the same phrase twice. */
function birds(kit: Kit, level: number, at: number): Strand {
  const amp = 0.045 * level;
  return sparse(at, () => rand(1.2, 4), (t) => {
    const side = rand(-0.75, 0.75);
    const kind = pick(["trill", "whistle", "tweet"] as const);
    if (kind === "trill") {
      const f0 = rand(3000, 4200);
      const notes = Math.floor(rand(3, 8));
      let s = t;
      for (let i = 0; i < notes; i++) {
        const d = rand(0.05, 0.08);
        tone(kit, kit.out, s, { freqs: [[0, f0], [d * 0.5, f0 * 1.25], [d, f0 * 0.95]], attack: 0.008, hold: d * 0.5, release: d * 0.5, amp, pan: side });
        s += d + rand(0.04, 0.08);
      }
    } else if (kind === "whistle") {
      const f0 = rand(2200, 2800);
      tone(kit, kit.out, t, { freqs: [[0, f0], [0.22, f0 * 1.25]], attack: 0.03, hold: 0.14, release: 0.08, amp: amp * 0.9, pan: side });
      tone(kit, kit.out, t + 0.32, { freqs: [[0, f0 * 1.25], [0.2, f0 * 1.05]], attack: 0.03, hold: 0.12, release: 0.08, amp: amp * 0.8, pan: side });
    } else {
      const n = Math.floor(rand(2, 5));
      for (let i = 0; i < n; i++) {
        const s = t + i * rand(0.11, 0.16);
        tone(kit, kit.out, s, { freqs: [[0, rand(4600, 5400)], [0.05, rand(2900, 3300)]], attack: 0.005, hold: 0.02, release: 0.035, amp: amp * 0.8, pan: side });
      }
    }
  });
}

/**
 * Crickets: three of them, each a steady high tone switched on and off in
 * little pulses — three or four to a chirp, a chirp every second or so.
 */
function crickets(kit: Kit, level: number, at: number): Strand {
  const singers = [4300, 4800, 5300].map((freq, i) => {
    const osc = kit.ctx.createOscillator();
    osc.frequency.value = freq + rand(-60, 60);
    const g = gain(kit, 0);
    osc.connect(g).connect(pan(kit, [-0.6, 0.1, 0.65][i])).connect(kit.out);
    osc.start(at);
    kit.sources.push(osc);
    return { g, next: at + rand(0, 1), amp: 0.022 * level * rand(0.6, 1), every: rand(0.55, 1.1) };
  });
  return {
    until(t, now = 0) {
      for (const c of singers) {
        if (c.next < now - 0.25) c.next = now + rand(0, c.every);
        while (c.next < t) {
          const pulses = Math.random() < 0.5 ? 3 : 4;
          for (let i = 0; i < pulses; i++) {
            const s = c.next + i * 0.042;
            c.g.gain.setValueAtTime(0, s);
            c.g.gain.linearRampToValueAtTime(c.amp, s + 0.005);
            c.g.gain.setValueAtTime(c.amp, s + 0.016);
            c.g.gain.linearRampToValueAtTime(0, s + 0.022);
          }
          c.next += c.every * rand(0.85, 1.2);
        }
      }
    },
    stop() {
      for (const c of singers) c.next = Infinity;
    },
  };
}

/** Rain: a soft hiss with a little body, breathing slowly, and the odd nearby drip. */
function rain(kit: Kit, level: number, at: number): Strand {
  const hp = filter(kit, "highpass", 900, 0.5);
  const lp = filter(kit, "lowpass", 6500, 0.5);
  const hiss = gain(kit, 0.3 * level);
  loop(kit, "white", at).connect(hp).connect(lp).connect(hiss).connect(kit.out);
  lfo(kit, hiss.gain, 0.07, 0.06 * level, at);
  const bodyF = filter(kit, "lowpass", 1100, 0.5);
  loop(kit, "pink", at).connect(bodyF).connect(gain(kit, 0.2 * level)).connect(kit.out);
  return sparse(at, () => rand(0.12, 0.5), (t) => {
    tone(kit, kit.out, t, { freqs: [[0, rand(1400, 3200)], [0.02, rand(900, 1300)]], attack: 0.002, hold: 0.004, release: 0.03, amp: 0.012 * level, pan: rand(-0.8, 0.8) });
  });
}

/** A city far away: a low rumble, and now and then a car swelling past. */
function city(kit: Kit, level: number, at: number): Strand {
  const f = filter(kit, "lowpass", 200, 0.5);
  loop(kit, "brown", at).connect(filter(kit, "highpass", 45, 0.5)).connect(f).connect(gain(kit, 0.28 * level)).connect(kit.out);
  const carF = filter(kit, "bandpass", 520, 0.8);
  const car = gain(kit, 0.0001);
  const carPan = "createStereoPanner" in kit.ctx ? kit.ctx.createStereoPanner() : null;
  loop(kit, "pink", at).connect(carF).connect(car);
  (carPan ? car.connect(carPan) : car).connect(kit.out);
  let next = at + rand(1, 4);
  return {
    until(t, now = 0) {
      if (next < now - 0.25) next = now + rand(1, 4);
      while (next < t) {
        const pass = rand(3, 5);
        car.gain.setValueAtTime(0.0001, next);
        car.gain.exponentialRampToValueAtTime(0.12 * level, next + pass * 0.5);
        car.gain.exponentialRampToValueAtTime(0.0001, next + pass);
        if (carPan) {
          const from = Math.random() < 0.5 ? -0.8 : 0.8;
          carPan.pan.setValueAtTime(from, next);
          carPan.pan.linearRampToValueAtTime(-from, next + pass);
        }
        next += pass + rand(2, 7);
      }
    },
    stop() {
      next = Infinity;
    },
  };
}

/** A campfire: a low roar, a stream of small crackles, and the occasional pop. */
function fire(kit: Kit, level: number, at: number): Strand {
  const f = filter(kit, "lowpass", 300, 0.5);
  const roar = gain(kit, 0.24 * level);
  loop(kit, "brown", at).connect(filter(kit, "highpass", 60, 0.5)).connect(f).connect(roar).connect(kit.out);
  lfo(kit, roar.gain, 0.3, 0.06 * level, at);
  return sparse(at, () => Math.max(0.02, -Math.log(1 - Math.random()) / 7), (t) => {
    const pop = Math.random() < 0.08;
    burst(kit, kit.out, t, {
      freq: pop ? rand(700, 1100) : rand(2200, 4800),
      q: pop ? 1.2 : 1,
      dur: pop ? rand(0.05, 0.09) : rand(0.012, 0.04),
      amp: (pop ? 0.5 : rand(0.12, 0.45)) * level,
      pan: rand(-0.35, 0.35),
    });
  });
}

/** Fireworks, far away: a soft thump, then a fizzle of tiny crackles as it opens. */
function fireworks(kit: Kit, level: number, at: number): Strand {
  return sparse(at, () => rand(2.5, 6), (t) => {
    const side = rand(-0.7, 0.7);
    burst(kit, kit.out, t, { freq: rand(110, 170), q: 0.7, dur: rand(0.8, 1.2), amp: 0.55 * level, color: "brown", type: "lowpass", pan: side });
    const sparks = Math.floor(rand(8, 20));
    for (let i = 0; i < sparks; i++) {
      burst(kit, kit.out, t + 0.15 + rand(0, 1.3), { freq: rand(2500, 5000), q: 1.4, dur: rand(0.01, 0.025), amp: rand(0.05, 0.16) * level, pan: side + rand(-0.2, 0.2) });
    }
  });
}

/** Underwater: a deep, muffled hush, with bubbles rising past — alone or in little glugs. */
function bubbles(kit: Kit, level: number, at: number): Strand {
  const f = filter(kit, "lowpass", 260, 0.5);
  const hush = gain(kit, 0.34 * level);
  loop(kit, "brown", at).connect(filter(kit, "highpass", 40, 0.5)).connect(f).connect(hush).connect(kit.out);
  lfo(kit, hush.gain, 0.08, 0.08 * level, at);
  return sparse(at, () => rand(0.25, 1.1), (t) => {
    const n = Math.random() < 0.3 ? Math.floor(rand(2, 5)) : 1;
    const side = rand(-0.6, 0.6);
    for (let i = 0; i < n; i++) {
      const f0 = rand(300, 750);
      const d = rand(0.04, 0.09);
      tone(kit, kit.out, t + i * rand(0.06, 0.12), { freqs: [[0, f0], [d, f0 * rand(1.8, 2.6)]], attack: 0.004, hold: d * 0.3, release: d * 0.9, amp: 0.05 * level, pan: side });
    }
  });
}

/** A whale somewhere out in the deep: a long, low, rising-and-falling call, echoing. */
function whale(kit: Kit, level: number, at: number): Strand {
  const echo = kit.ctx.createDelay(1);
  echo.delayTime.value = 0.42;
  const feedback = gain(kit, 0.38);
  const wet = gain(kit, 0.5);
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(kit.out);
  const dry = gain(kit, 1);
  dry.connect(kit.out);
  dry.connect(echo);
  return sparse(at, () => rand(12, 22), (t) => {
    const low = rand(140, 190);
    const len = rand(2.8, 4);
    for (const detune of [1, 1.006]) {
      tone(kit, dry, t, {
        freqs: [[0, low * detune], [len * 0.45, low * 1.7 * detune], [len, low * 1.1 * detune]],
        attack: 0.9,
        hold: len - 2,
        release: 1.1,
        amp: 0.05 * level,
        lowpass: 700,
      });
    }
  });
}

/** A faint shimmer of dream: now and then a soft, high bell note from a pentatonic scale. */
function shimmer(kit: Kit, level: number, at: number): Strand {
  const notes = [2093, 2349, 2637, 3136, 3520, 4186];
  return sparse(at, () => rand(3, 7), (t) => {
    const f = pick(notes);
    tone(kit, kit.out, t, { freqs: [[0, f]], attack: 0.01, hold: 0.02, release: rand(1.4, 2.2), amp: 0.012 * level, pan: rand(-0.7, 0.7) });
    if (Math.random() < 0.4) {
      tone(kit, kit.out, t + rand(0.12, 0.25), { freqs: [[0, f * 1.5]], attack: 0.01, hold: 0.02, release: 1.2, amp: 0.007 * level, pan: rand(-0.7, 0.7) });
    }
  });
}

const STRANDS: Record<AmbienceLayer, (kit: Kit, level: number, at: number) => Strand> = {
  wind,
  waves,
  gulls,
  birds,
  crickets,
  rain,
  city,
  fire,
  fireworks,
  bubbles,
  whale,
  shimmer,
};

// ---- A whole scene ---------------------------------------------------------------------

type Scene = { out: GainNode; strands: Strand[]; sources: AudioScheduledSourceNode[] };

function buildScene(ctx: Ctx, into: AudioNode, preset: AmbiencePreset, at: number): Scene {
  const out = ctx.createGain();
  out.connect(into);
  const kit: Kit = { ctx, out, sources: [] };
  const strands = Object.entries(preset.layers)
    .filter(([, level]) => (level ?? 0) > 0)
    .map(([layer, level]) => STRANDS[layer as AmbienceLayer](kit, level!, at));
  return { out, strands, sources: kit.sources };
}

function endScene(scene: Scene, at: number) {
  for (const s of scene.strands) s.stop(at);
  for (const src of scene.sources) {
    try {
      src.stop(at);
    } catch {
      // Already stopped.
    }
  }
}

/** Overall level: well under the narrator, Hina and the magic, which play near full scale. */
const MASTER = 0.32;
/** How far a voice pushes the world down while it speaks. */
const DUCKED = 0.4;
const CROSSFADE_S = 2.5;
/** How far ahead sparse events are scheduled, and how often the timer tops them up. */
const AHEAD_S = 1.5;
const TICK_MS = 500;

function masterChain(ctx: Ctx): { input: GainNode; duck: GainNode } {
  const input = ctx.createGain();
  input.gain.value = MASTER;
  const duck = ctx.createGain();
  // A gentle compressor, so a firework's thump or a close gull never jumps out.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  input.connect(duck).connect(comp).connect(ctx.destination);
  return { input, duck };
}

export type Ambience = {
  /** Plays what this scene would sound like, crossfading from the last one if it differs. */
  setScene(description: string): void;
  /** Pushes the world down while a voice is speaking, and back up after. */
  duck(on: boolean): void;
  setEnabled(on: boolean): void;
  stop(): void;
};

/**
 * The live ambience for one play session. Its AudioContext is only made on the
 * first scene — call it after the player has clicked something, or the browser
 * keeps it silent.
 */
export function createAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let chain: { input: GainNode; duck: GainNode } | null = null;
  let current: { scene: Scene; key: string } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let enabled = true;
  let ducked = false;
  let lastText = "";

  const open = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      chain = masterChain(ctx);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  };

  const tick = () => {
    if (!ctx || !current) return;
    const until = ctx.currentTime + AHEAD_S;
    for (const s of current.scene.strands) s.until(until, ctx.currentTime);
  };

  const fadeOut = (scene: Scene, now: number) => {
    scene.out.gain.cancelScheduledValues(now);
    scene.out.gain.setValueAtTime(scene.out.gain.value, now);
    scene.out.gain.linearRampToValueAtTime(0, now + CROSSFADE_S);
    endScene(scene, now + CROSSFADE_S + 0.1);
    setTimeout(() => scene.out.disconnect(), (CROSSFADE_S + 0.3) * 1000);
  };

  const play = (description: string) => {
    const ac = open();
    if (!ac || !chain) return;
    const preset = sceneAmbience(description);
    const key = JSON.stringify(preset.layers);
    if (current?.key === key) return;
    const now = ac.currentTime;
    if (current) fadeOut(current.scene, now);
    const scene = buildScene(ac, chain.input, preset, now + 0.05);
    scene.out.gain.setValueAtTime(0, now);
    scene.out.gain.linearRampToValueAtTime(1, now + CROSSFADE_S);
    current = { scene, key };
    tick();
    timer ??= setInterval(tick, TICK_MS);
  };

  return {
    setScene(description) {
      lastText = description;
      if (enabled && description.trim()) play(description);
    },
    duck(on) {
      if (on === ducked) return;
      ducked = on;
      if (!ctx || !chain) return;
      chain.duck.gain.setTargetAtTime(on ? DUCKED : 1, ctx.currentTime, on ? 0.15 : 0.6);
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (on) {
        if (lastText.trim()) play(lastText);
        return;
      }
      if (ctx && current) fadeOut(current.scene, ctx.currentTime);
      current = null;
      if (timer) clearInterval(timer);
      timer = null;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (ctx && current) endScene(current.scene, ctx.currentTime);
      current = null;
      void ctx?.close().catch(() => {});
      ctx = null;
      chain = null;
    },
  };
}

/** Renders a preset offline, to listen to or measure without a live page. */
export async function renderAmbience(preset: AmbiencePreset, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const { input } = masterChain(ctx);
  const scene = buildScene(ctx, input, preset, 0);
  for (const s of scene.strands) s.until(seconds);
  return ctx.startRendering();
}
