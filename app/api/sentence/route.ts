import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";
import { toRomaji } from "@/lib/romaji";

export const runtime = "nodejs";

type SentenceRequest = {
  scene: string;
  /** Sentences already said this session, so the world does not repeat itself. */
  recent?: string[];
  learn?: Learn;
};

// In English mode (lib/learn.ts) the same shape carries an English sentence:
// `kana` is the English word, `romaji` its katakana reading for a Japanese
// child, `english` its Japanese meaning, and `sentenceEn` the whole meaning.

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

export type SentenceChallenge = {
  parts: SentencePart[];
  /** The sentence as it is read, particles attached: "ゆきが ふる". */
  sentenceKana: string;
  /** Word by word, so a beginner can sound it out: "yuki ga furu". */
  sentenceRomaji: string;
  sentenceEn: string;
  /** The one clear step Orbis is steered with when the sentence lands. */
  changeEn: string;
  /** The whole world after that step. It becomes the new base scene. */
  sceneEn: string;
};

const KANJI = /[一-龯㐀-䶿]/;
const KANA_ONLY = /^[぀-ヿー]+$/;
const PARTICLES = new Set(["が", "は", "を", "に", "で", "の", "と", "へ", "も"]);

// Most words are taught and then said once; the sentence is the payoff. So the
// sentence has to be worth saying: when it lands, the world should look like a
// different place, not a slightly edited one.
//
// changeEn follows the Orbis prompt guide: one clear, physical step from the
// scene as it is ("snow begins to fall and the park turns white"), not a
// re-description of the whole world, which reads to the model as a rebuild.
const SYSTEM = `You write ONE short Japanese sentence for an absolute beginner inside a living video world. They learn it word by word, then say it whole — and when they do, the WHOLE world transforms.

Given the scene, write a sentence that makes the whole world change. The live video model reliably renders only these changes, so the change MUST be one of them, whichever contrasts with the scene as it is now:
- If it is day or golden hour: night falls (よるが くる), the stars come out (ほしが かがやく / ほしが でる), the moon rises (つきが のぼる / つきが でる), or night falls with fireworks (はなびが あがる).
- If it is already night: morning comes (あさが くる), or the sun rises (ひが のぼる).
Snow, rain, autumn leaves, sunsets and lanterns render faintly or not at all — never use them.

Hard rules for the sentence:
- HIRAGANA and KATAKANA ONLY. Never any kanji. Write 雪 as ゆき, 降る as ふる, 空 as そら.
- Exactly 2 or 3 content words joined by particles (が, は, を, に, で, の, と, へ, も). 4 to 12 kana in total.
- The most common JLPT N5 words. Verbs in plain dictionary form (ふる, さく, ひかる), never -ます.
- Split it into "parts", in order. Each content word is {"kind":"word"} with a short "english" gloss and "accept": other spellings of THAT SAME word with the SAME reading, above all its normal kanji spelling (ゆき → ["雪"], ふる → ["降る"], さす → ["差す"]). Never a different word that means something similar. Each particle is {"kind":"particle","kana":"が"}.

Hard rules for the world:
- "changeEn": ONE sentence, what the camera sees change, starting from the current scene. Physical nouns and verbs, stated positively. e.g. "The golden light fades as night falls, the sky turning deep indigo and full of stars."
- "sceneEn": the full scene AFTER the change, 1-3 sentences under 80 words: the same place, the same art-style words as the current scene, with the change fully in place.
- The change must fit the place (no teleporting somewhere else) and must differ from the recent sentences you are shown.

Respond ONLY with compact JSON, no markdown fences:
{"parts":[{"kind":"word","kana":"ゆき","english":"snow","accept":["雪"]},{"kind":"particle","kana":"が"},{"kind":"word","kana":"ふる","english":"falls","accept":["降る"]}],"sentenceEn":"Snow falls.","changeEn":"...","sceneEn":"..."}`;

type Draft = {
  parts?: { kind?: string; kana?: string; english?: string; accept?: unknown }[];
  sentenceEn?: string;
  changeEn?: string;
  sceneEn?: string;
};

/** Returns a reason the draft cannot be used, or null if it can. */
function problem(draft: Draft): string | null {
  const parts = draft.parts ?? [];
  const words = parts.filter((p) => p.kind === "word");
  if (words.length < 2 || words.length > 3) return "it did not have 2 or 3 content words";
  for (const part of parts) {
    const kana = part.kana?.trim() ?? "";
    if (!kana) return "a part had no kana";
    if (KANJI.test(kana) || !KANA_ONLY.test(kana)) return `"${kana}" was not kana only`;
    if (part.kind === "particle" && !PARTICLES.has(kana)) return `"${kana}" is not a simple particle`;
    if (part.kind !== "word" && part.kind !== "particle") return "a part had no kind";
  }
  if (!draft.changeEn?.trim() || !draft.sceneEn?.trim()) return "changeEn or sceneEn was missing";
  return null;
}

// は and へ are read wa and e when they are particles; romaji is only a
// scaffold, but a wrong one teaches the wrong sound.
function particleRomaji(kana: string): string {
  if (kana === "は") return "wa";
  if (kana === "へ") return "e";
  return toRomaji(kana);
}

function toChallenge(draft: Draft): SentenceChallenge {
  const parts: SentencePart[] = (draft.parts ?? []).map((p) => {
    const kana = p.kana!.trim();
    if (p.kind === "particle") return { kana, kind: "particle" };
    return {
      kana,
      kind: "word",
      // Our own transliteration over the model's: deterministic, and it is
      // what a beginner will actually try to pronounce.
      romaji: toRomaji(kana),
      english: p.english?.trim() ?? "",
      accept: Array.isArray(p.accept)
        ? p.accept.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        : [],
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
    sentenceRomaji: parts
      .map((p) => (p.kind === "particle" ? particleRomaji(p.kana) : p.romaji))
      .join(" "),
    sentenceEn: draft.sentenceEn?.trim() ?? "",
    changeEn: draft.changeEn!.trim(),
    sceneEn: draft.sceneEn!.trim(),
  };
}

// The same sentence the other way round: a Japanese-speaking child learning
// English. The world changes it may ask for are the same ones Orbis renders.
const SYSTEM_EN = `You write ONE short English sentence for a young Japanese-speaking child who is just starting to learn English, inside a living video world. They learn it word by word, then say it whole — and when they do, the WHOLE world transforms.

Given the scene, write a sentence that makes the whole world change. The live video model reliably renders only these changes, so the change MUST be one of them, whichever contrasts with the scene as it is now:
- If it is day or golden hour: night falls ("Night comes."), the stars come out ("The stars shine."), the moon rises ("The moon rises."), or fireworks go up ("Fireworks go up.").
- If it is already night: morning comes ("Morning comes."), or the sun rises ("The sun rises.").
Snow, rain, autumn leaves, sunsets and lanterns render faintly or not at all — never use them.

Hard rules for the sentence:
- Exactly 2 or 3 content words, plus at most one "the" or "a". Present simple. Only the very first English words a child learns.
- Split it into "parts", in order. Each content word is {"kind":"word","word":"moon","meaning":"つき","reading":"ムーン","accept":[...]}: "meaning" is the word's meaning in simple Japanese kana a child can read, "reading" is how it sounds, in katakana, and "accept" lists other spellings a speech recogniser might hand back for the SAME spoken word — homophones and other forms ("night" → ["knight"], "sun" → ["son"], "rises" → ["rise"]). Never a different word that means something similar. Each "the" or "a" is {"kind":"small","word":"the","reading":"ザ"}.
- "meaning": the whole sentence in simple Japanese kana, the way a child would say it.

Hard rules for the world:
- "changeEn": ONE sentence, what the camera sees change, starting from the current scene. Physical nouns and verbs, stated positively. e.g. "The golden light fades as night falls, the sky turning deep indigo and full of stars."
- "sceneEn": the full scene AFTER the change, 1-3 sentences under 80 words: the same place, the same art-style words as the current scene, with the change fully in place.
- The change must fit the place (no teleporting somewhere else) and must differ from the recent sentences you are shown.

Respond ONLY with compact JSON, no markdown fences:
{"parts":[{"kind":"small","word":"the","reading":"ザ"},{"kind":"word","word":"moon","meaning":"つき","reading":"ムーン","accept":[]},{"kind":"word","word":"rises","meaning":"のぼる","reading":"ライズィズ","accept":["rise"]}],"meaning":"つきが のぼる","changeEn":"...","sceneEn":"..."}`;

type DraftEn = {
  parts?: { kind?: string; word?: string; meaning?: string; reading?: string; accept?: unknown }[];
  meaning?: string;
  changeEn?: string;
  sceneEn?: string;
};

const ENGLISH_WORD = /^[A-Za-z][A-Za-z'-]*$/;
const SMALL_WORDS = new Set(["the", "a", "an"]);

function problemEn(draft: DraftEn): string | null {
  const parts = draft.parts ?? [];
  const words = parts.filter((p) => p.kind === "word");
  if (words.length < 2 || words.length > 3) return "it did not have 2 or 3 content words";
  for (const part of parts) {
    const word = part.word?.trim() ?? "";
    if (!ENGLISH_WORD.test(word)) return `"${word}" was not a single English word`;
    if (part.kind === "small" && !SMALL_WORDS.has(word.toLowerCase())) return `"${word}" is not "the" or "a"`;
    if (part.kind !== "word" && part.kind !== "small") return "a part had no kind";
  }
  if (!draft.changeEn?.trim() || !draft.sceneEn?.trim()) return "changeEn or sceneEn was missing";
  return null;
}

// "the" and "a" play the part particles play in Japanese: shown, never taught
// on their own, and not needed for the sentence to count.
function toChallengeEn(draft: DraftEn): SentenceChallenge {
  const parts: SentencePart[] = (draft.parts ?? []).map((p) => {
    const word = p.word!.trim().toLowerCase();
    if (p.kind === "small") return { kana: word, kind: "particle", romaji: p.reading?.trim() };
    return {
      kana: word,
      kind: "word",
      romaji: p.reading?.trim() ?? "",
      english: p.meaning?.trim() ?? "",
      accept: Array.isArray(p.accept)
        ? p.accept.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        : [],
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
    sentenceEn: draft.meaning?.trim() ?? "",
    changeEn: draft.changeEn!.trim(),
    sceneEn: draft.sceneEn!.trim(),
  };
}

export async function POST(request: Request) {
  let body: SentenceRequest;
  try {
    body = (await request.json()) as SentenceRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });

  if (!hasModel()) {
    return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });
  }

  const learn = asLearn(body.learn);
  const recent = (body.recent ?? []).filter(Boolean);
  const ask = (extra = "") =>
    chatJson<Draft & DraftEn>({
      system: learn === "en" ? SYSTEM_EN : SYSTEM,
      user:
        `Scene: ${scene}\n\n` +
        (recent.length ? `Already said, transform the world some other way: ${recent.join(" | ")}\n\n` : "") +
        `Write the sentence.${extra}`,
      temperature: 0.8,
      maxTokens: 700,
    });

  try {
    const check = (d: Draft & DraftEn) => (learn === "en" ? problemEn(d) : problem(d));
    let draft = await ask();
    let reason = check(draft);
    // The model will reach for kanji, or a fourth word, unless it is caught
    // and told once more.
    if (reason) {
      draft = await ask(`\n\nYour previous answer could not be used because ${reason}. Follow every hard rule.`);
      reason = check(draft);
    }
    if (reason) {
      return NextResponse.json({ error: `Could not build a sentence: ${reason}` }, { status: 502 });
    }

    const challenge = learn === "en" ? toChallengeEn(draft) : toChallenge(draft);
    return NextResponse.json(challenge satisfies SentenceChallenge);
  } catch (error) {
    console.error("Sentence failed", error);
    return NextResponse.json({ error: "Could not build a sentence" }, { status: 502 });
  }
}
