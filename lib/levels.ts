// Difficulty ladder. A level controls two things at once: how much Japanese
// the narrator speaks at you (input), and how much you have to produce back
// (output). You start by answering with a single word and work up to
// describing the scene yourself.

export type Level = {
  id: number;
  nameJp: string;
  nameEn: string;
  blurb: string;
  /** How complex the narrator's Japanese should be. */
  narrationBrief: string;
  /** What counts as a passing answer at this level. */
  answerBrief: string;
  /** Placeholder shown in the answer input. */
  inputHint: string;
};

export const LEVELS: Level[] = [
  {
    id: 1,
    nameJp: "ひとこと",
    nameEn: "Single word",
    blurb: "Answer with one word. The narrator keeps it very simple.",
    narrationBrief:
      "ONE very short sentence, 5-8 words max, using only the most common JLPT N5 vocabulary and hiragana/katakana where natural.",
    answerBrief:
      "A SINGLE WORD is a full, correct answer at this level. Accept one noun (or one adjective/verb) that names something genuinely present in or relevant to the scene. Do not require particles, verbs, or sentence structure.",
    inputHint: "ひとこと で…",
  },
  {
    id: 2,
    nameJp: "フレーズ",
    nameEn: "Short phrase",
    blurb: "Two or three words together — start using particles.",
    narrationBrief:
      "ONE simple sentence using JLPT N5 vocabulary and basic particles (は, が, に, を).",
    answerBrief:
      "A short phrase of 2-4 words is a full, correct answer. A noun plus a particle, or a noun plus a simple verb/adjective, is enough. Do not demand a complete polite sentence.",
    inputHint: "みじかい フレーズ で…",
  },
  {
    id: 3,
    nameJp: "ぶん",
    nameEn: "Full sentence",
    blurb: "A complete sentence with particles and a verb.",
    narrationBrief:
      "TWO short sentences using JLPT N5-N4 vocabulary and natural particles.",
    answerBrief:
      "A complete sentence with a subject/topic, correct-enough particles, and a verb or adjective ending. Small grammar slips are fine as long as the meaning lands.",
    inputHint: "ぶん で かいてください…",
  },
  {
    id: 4,
    nameJp: "びょうしゃ",
    nameEn: "Description",
    blurb: "Describe the scene richly — multiple clauses, more vocabulary.",
    narrationBrief:
      "TWO to THREE flowing sentences using JLPT N4-N3 vocabulary, with some descriptive adjectives and connected clauses.",
    answerBrief:
      "A descriptive answer of one or more connected clauses, showing some range of vocabulary or a conjunction (て-form, から, けど). Reward ambition over perfect accuracy.",
    inputHint: "くわしく せつめい してください…",
  },
];

export const DEFAULT_LEVEL_ID = 1;

export function getLevel(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
