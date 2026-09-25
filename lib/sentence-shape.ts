import type { Learn } from "@/lib/learn";
import { toRomaji } from "@/lib/romaji";

// A short sentence taught a word at a time, in either language (lib/learn.ts):
// the rules a model's draft has to follow, and the shape the game shows. The
// world-changing sentences (/api/sentence) and the quests (/api/quest) are
// both built from it.
//
// In English mode the same shape carries an English sentence: `kana` is the
// English word, `romaji` its katakana reading for a Japanese child, `english`
// its Japanese meaning, and `sentenceEn` the whole meaning.

export type SentencePart = {
  /** Kana only — this rung is for people who cannot read kanji. */
  kana: string;
  kind: "word" | "particle";
  /** Words only. */
  romaji?: string;
  english?: string;
  /**
   * Other spellings that should count as saying this word — above all the
   * kanji. Speech recognition runs in ja-JP and returns 雪, not ゆき.
   */
  accept?: string[];
};

export type TaughtSentence = {
  parts: SentencePart[];
  /** The sentence as it is read, particles attached: "ゆきが ふる". */
  sentenceKana: string;
  /** Word by word, so a beginner can sound it out: "yuki ga furu". */
  sentenceRomaji: string;
  sentenceEn: string;
};

/** A part as a model drafts it: Japanese uses kana/english, English word/meaning/reading. */
export type DraftPart = {
  kind?: string;
  kana?: string;
  english?: string;
  word?: string;
  meaning?: string;
  reading?: string;
  accept?: unknown;
};

/** The sentence rules, as a prompt states them, for each language. */
export const SENTENCE_RULES: Record<Learn, string> = {
  ja: `- HIRAGANA and KATAKANA ONLY. Never any kanji. Write 雪 as ゆき, 降る as ふる, 空 as そら.
- Exactly 2 or 3 content words joined by particles (が, は, を, に, で, の, と, へ, も). 4 to 12 kana in total.
- The most common JLPT N5 words. Verbs in plain dictionary form (ふる, さく, ひかる), never -ます.
- Split it into "parts", in order. Each content word is {"kind":"word","kana":"ゆき","english":"snow","accept":["雪"]} with a short "english" gloss and "accept": other spellings of THAT SAME word with the SAME reading, above all its normal kanji spelling (ゆき → ["雪"], ふる → ["降る"]). Never a different word that means something similar. Each particle is {"kind":"particle","kana":"が"}.`,
  en: `- Exactly 2 or 3 content words, plus at most one "the" or "a". Present simple. Only the very first English words a child learns.
- Split it into "parts", in order. Each content word is {"kind":"word","word":"moon","meaning":"つき","reading":"ムーン","accept":[...]}: "meaning" is the word's meaning in simple Japanese kana a child can read, "reading" is how it sounds, in katakana, and "accept" lists other spellings a speech recogniser might hand back for the SAME spoken word — homophones and other forms ("night" → ["knight"], "sun" → ["son"], "rises" → ["rise"]). Never a different word that means something similar. Each "the" or "a" is {"kind":"small","word":"the","reading":"ザ"}.`,
};

/**
 * The same card at the lowest rung, where one word is a whole turn. Free
 * choice drifted to words no child says (ともす, ともって), so the word comes
 * from a short list of the requests and greetings small children already use.
 */
export const ONE_WORDS: Record<Learn, Record<string, string>> = {
  ja: {
    つけて: "turn it on!", とんで: "fly! / jump!", おきて: "wake up!", ねて: "sleep!", うたって: "sing!",
    おいで: "come here!", およいで: "swim!", はしって: "run!", まわって: "spin!", おどって: "dance!",
    わらって: "smile!", たべて: "eat!", さいて: "bloom!", ひかって: "shine!", あけて: "open!",
    とまって: "stop!", がんばれ: "you can do it!", ありがとう: "thank you", おはよう: "good morning",
    おやすみ: "good night", こんにちは: "hello",
  },
  en: {
    jump: "とんで", fly: "とんで", wake: "おきて", sleep: "ねて", sing: "うたって", come: "おいで",
    swim: "およいで", run: "はしって", spin: "まわって", dance: "おどって", smile: "わらって", eat: "たべて",
    grow: "そだって", shine: "ひかって", open: "あけて", stop: "とまって", hello: "こんにちは",
    thanks: "ありがとう", goodnight: "おやすみ",
  },
};

export const ONE_WORD_RULES: Record<Learn, string> = {
  ja: `- EXACTLY ONE word, no particles, and it MUST be one of these: ${Object.entries(ONE_WORDS.ja).map(([w, e]) => `${w} (${e})`).join(", ")}. Pick the one whose meaning makes the happy ending happen, and write the quest around it.
- "parts" holds just that one word: [{"kind":"word","kana":"とんで","english":"fly!","accept":["飛んで","跳んで"]}], with "accept" listing its other spellings with the SAME reading, above all the kanji.`,
  en: `- EXACTLY ONE English word, and it MUST be one of these: ${Object.keys(ONE_WORDS.en).join(", ")}. Pick the one that makes the happy ending happen, and write the quest around it.
- "parts" holds just that one word: [{"kind":"word","word":"jump","meaning":"とんで","reading":"ジャンプ","accept":["jumps"]}]: "meaning" in simple Japanese kana, "reading" how it sounds in katakana.`,
};

const KANJI = /[一-龯㐀-䶿]/;
const KANA_ONLY = /^[぀-ヿー]+$/;
const PARTICLES = new Set(["が", "は", "を", "に", "で", "の", "と", "へ", "も"]);
const ENGLISH_WORD = /^[A-Za-z][A-Za-z'-]*$/;
const SMALL_WORDS = new Set(["the", "a", "an"]);

/** Why a drafted sentence cannot be taught, or null if it can. */
export function partsProblem(learn: Learn, parts: DraftPart[] = [], oneWord = false): string | null {
  const words = parts.filter((p) => p.kind === "word");
  if (oneWord) {
    if (words.length !== 1 || parts.length !== 1) return "it was not exactly one word";
    const said = (learn === "en" ? words[0].word : words[0].kana)?.trim().toLowerCase() ?? "";
    if (!(said in ONE_WORDS[learn])) return `"${said}" is not one of the listed words`;
  } else if (words.length < 2 || words.length > 3) return "it did not have 2 or 3 content words";
  for (const part of parts) {
    if (learn === "en") {
      const word = part.word?.trim() ?? "";
      if (!ENGLISH_WORD.test(word)) return `"${word}" was not a single English word`;
      if (part.kind === "small" && !SMALL_WORDS.has(word.toLowerCase())) return `"${word}" is not "the" or "a"`;
      if (part.kind !== "word" && part.kind !== "small") return "a part had no kind";
    } else {
      const kana = part.kana?.trim() ?? "";
      if (!kana) return "a part had no kana";
      if (KANJI.test(kana) || !KANA_ONLY.test(kana)) return `"${kana}" was not kana only`;
      if (part.kind === "particle" && !PARTICLES.has(kana)) return `"${kana}" is not a simple particle`;
      if (part.kind !== "word" && part.kind !== "particle") return "a part had no kind";
    }
  }
  return null;
}

const accepted = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((a): a is string => typeof a === "string" && a.trim().length > 0) : [];

// は and へ are read wa and e when they are particles; romaji is only a
// scaffold, but a wrong one teaches the wrong sound.
function particleRomaji(kana: string): string {
  if (kana === "は") return "wa";
  if (kana === "へ") return "e";
  return toRomaji(kana);
}

/** A checked draft as the sentence card shows it. `meaning` is the whole sentence's meaning. */
export function shapeSentence(learn: Learn, drafted: DraftPart[], meaning = ""): TaughtSentence {
  if (learn === "en") {
    // "the" and "a" play the part particles play in Japanese: shown, never
    // taught on their own, and not needed for the sentence to count.
    const parts: SentencePart[] = drafted.map((p) => {
      const word = p.word!.trim().toLowerCase();
      if (p.kind === "small") return { kana: word, kind: "particle", romaji: p.reading?.trim() };
      return {
        kana: word,
        kind: "word",
        romaji: p.reading?.trim() ?? "",
        english: p.meaning?.trim() ?? "",
        accept: accepted(p.accept),
      };
    });
    const sentence = parts.map((p) => p.kana).join(" ");
    return {
      parts,
      sentenceKana: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`,
      sentenceRomaji: parts
        .map((p) => p.romaji ?? "")
        .filter(Boolean)
        .join(" "),
      sentenceEn: meaning.trim(),
    };
  }

  const parts: SentencePart[] = drafted.map((p) => {
    const kana = p.kana!.trim();
    if (p.kind === "particle") return { kana, kind: "particle" };
    return {
      kana,
      kind: "word",
      // Our own transliteration over the model's: deterministic, and it is
      // what a beginner will actually try to pronounce.
      romaji: toRomaji(kana),
      english: p.english?.trim() ?? "",
      accept: accepted(p.accept),
    };
  });

  // Particles ride on the word before them, the way the sentence is read.
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.kind === "particle" && chunks.length) chunks[chunks.length - 1] += part.kana;
    else chunks.push(part.kana);
  }
  return {
    parts,
    sentenceKana: chunks.join(" "),
    sentenceRomaji: parts.map((p) => (p.kind === "particle" ? particleRomaji(p.kana) : p.romaji)).join(" "),
    sentenceEn: meaning.trim(),
  };
}
