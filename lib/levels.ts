// Difficulty ladder. A rung controls three things at once: how much Japanese
// the narrator speaks at you (input), how much you have to produce back
// (output), and how much English rides along (support).
//
// Rungs 0-2 exist so that someone with NO Japanese can play. The design
// principle is in indser/BEGINNER-DESIGN.md and is worth repeating here because
// it is easy to break by accident:
//
//   Lower the production load. Never lower the payoff.
//
// At every rung the reward is identical — the living world visibly changes
// because of you. What changes is only how much Japanese you generate unaided.
// Never gate the world behind competence, and never ask a player to act on
// meaning they do not have.

/** What the player has to produce this turn. */
export type LevelMode = "echo" | "choose" | "fill" | "free";

/** How much English rides along with the Japanese. */
export type LevelSupport = "all" | "new" | "words" | "none";

export type Level = {
  id: number;
  nameJp: string;
  nameEn: string;
  blurb: string;
  /** How complex the narrator's Japanese should be. */
  narrationBrief: string;
  /** What counts as a passing answer at this rung. */
  answerBrief: string;
  /** Placeholder shown in the answer input. */
  inputHint: string;
  mode: LevelMode;
  /** Show romaji on the prompt card. A scaffold with an expiry date — rungs 0-1 only. */
  romaji: boolean;
  support: LevelSupport;
};

export const LEVELS: Level[] = [
  {
    id: 0,
    nameJp: "まねる",
    nameEn: "Echo",
    blurb: "Hear one word and say it back. No reading needed.",
    narrationBrief:
      "ONE very short sentence of 3-6 words, JLPT N5, hiragana and katakana only, no kanji at all.",
    answerBrief:
      "The learner is repeating a single word they were just shown. Accept any recognisable attempt at that word. Pronunciation, particles and grammar are irrelevant here.",
    inputHint: "いってみて…",
    mode: "echo",
    romaji: true,
    support: "all",
  },
  {
    id: 1,
    nameJp: "えらぶ",
    nameEn: "Choose",
    blurb: "Pick one of two things to make happen. Kana only.",
    narrationBrief:
      "ONE short sentence, JLPT N5, hiragana and katakana only, no kanji at all.",
    answerBrief:
      "A single word or a short phrase naming something in the scene is a full, correct answer.",
    inputHint: "えらんで…",
    mode: "choose",
    romaji: true,
    support: "all",
  },
  {
    id: 2,
    nameJp: "うめる",
    nameEn: "Fill the gap",
    blurb: "The sentence is written for you — you supply the missing word.",
    narrationBrief:
      "ONE simple sentence using JLPT N5 vocabulary and the particles は and が, mostly kana.",
    answerBrief:
      "The learner is completing a sentence frame. Accept the frame with any sensible word filled in; do not demand more than that.",
    inputHint: "ことばを えらんで…",
    mode: "fill",
    romaji: false,
    support: "new",
  },
  {
    id: 3,
    nameJp: "ひとこと",
    nameEn: "Single word",
    blurb: "Answer with one word. The narrator keeps it very simple.",
    narrationBrief:
      "ONE very short sentence, 5-8 words max, using only the most common JLPT N5 vocabulary and hiragana/katakana where natural.",
    answerBrief:
      "A SINGLE WORD is a full, correct answer at this level. Accept one noun (or one adjective/verb) that names something genuinely present in or relevant to the scene. Do not require particles, verbs, or sentence structure.",
    inputHint: "ひとこと で…",
    mode: "free",
    romaji: false,
    support: "new",
  },
  {
    id: 4,
    nameJp: "フレーズ",
    nameEn: "Short phrase",
    blurb: "Two or three words together — start using particles.",
    narrationBrief:
      "ONE simple sentence using JLPT N5 vocabulary and basic particles (は, が, に, を).",
    answerBrief:
      "A short phrase of 2-4 words is a full, correct answer. A noun plus a particle, or a noun plus a simple verb/adjective, is enough. Do not demand a complete polite sentence.",
    inputHint: "みじかい フレーズ で…",
    mode: "free",
    romaji: false,
    support: "words",
  },
  {
    id: 5,
    nameJp: "ぶん",
    nameEn: "Full sentence",
    blurb: "A complete sentence with particles and a verb.",
    narrationBrief:
      "TWO short sentences using JLPT N5-N4 vocabulary and natural particles.",
    answerBrief:
      "A complete sentence with a subject/topic, correct-enough particles, and a verb or adjective ending. Small grammar slips are fine as long as the meaning lands.",
    inputHint: "ぶん で かいてください…",
    mode: "free",
    romaji: false,
    support: "words",
  },
  {
    id: 6,
    nameJp: "びょうしゃ",
    nameEn: "Description",
    blurb: "Describe the scene richly — multiple clauses, more vocabulary.",
    narrationBrief:
      "TWO to THREE flowing sentences using JLPT N4-N3 vocabulary, with some descriptive adjectives and connected clauses.",
    answerBrief:
      "A descriptive answer of one or more connected clauses, showing some range of vocabulary or a conjunction (て-form, から, けど). Reward ambition over perfect accuracy.",
    inputHint: "くわしく せつめい してください…",
    mode: "free",
    romaji: false,
    support: "none",
  },
];

/** Everyone starts at the bottom — see "Choosing the rung" in the design doc. */
export const DEFAULT_LEVEL_ID = 0;

/** The first rung that asks for unaided Japanese, for the "I already know some" jump. */
export const FIRST_FREE_LEVEL_ID = 3;

export function getLevel(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

const RUNG_KEY = "yume.rung.v1";

export function loadRung(): number {
  try {
    const raw = localStorage.getItem(RUNG_KEY);
    if (raw === null) return DEFAULT_LEVEL_ID;
    const n = Number(raw);
    return LEVELS.some((l) => l.id === n) ? n : DEFAULT_LEVEL_ID;
  } catch {
    return DEFAULT_LEVEL_ID;
  }
}

export function saveRung(id: number) {
  try {
    localStorage.setItem(RUNG_KEY, String(id));
  } catch {
    // Storage being unavailable must never break the game loop.
  }
}

/**
 * Silent auto-levelling: 3 of the last 4 turns correct moves up, 3 misses in a
 * row moves down. Never announced — the player should notice only that Hina is
 * speaking more Japanese, not that a number changed.
 *
 * `history` is most-recent-last.
 */
export function nextRung(current: number, history: boolean[]): number {
  const last4 = history.slice(-4);
  if (last4.length >= 4 && last4.filter(Boolean).length >= 3) {
    return Math.min(current + 1, LEVELS[LEVELS.length - 1].id);
  }
  const last3 = history.slice(-3);
  if (last3.length >= 3 && last3.every((ok) => !ok)) {
    return Math.max(current - 1, LEVELS[0].id);
  }
  return current;
}
