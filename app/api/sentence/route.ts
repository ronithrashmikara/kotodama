import { NextResponse } from "next/server";

import { chatJson, hasModel } from "@/lib/llm";
import { toRomaji } from "@/lib/romaji";

export const runtime = "nodejs";

type SentenceRequest = {
  scene: string;
  /** Sentences already said this session, so the world does not repeat itself. */
  recent?: string[];
};

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

  const recent = (body.recent ?? []).filter(Boolean);
  const ask = (extra = "") =>
    chatJson<Draft>({
      system: SYSTEM,
      user:
        `Scene: ${scene}\n\n` +
        (recent.length ? `Already said, transform the world some other way: ${recent.join(" | ")}\n\n` : "") +
        `Write the sentence.${extra}`,
      temperature: 0.8,
      maxTokens: 700,
    });

  try {
    let draft = await ask();
    let reason = problem(draft);
    // The model will reach for kanji, or a fourth word, unless it is caught
    // and told once more.
    if (reason) {
      draft = await ask(`\n\nYour previous answer could not be used because ${reason}. Follow every hard rule.`);
      reason = problem(draft);
    }
    if (reason) {
      return NextResponse.json({ error: `Could not build a sentence: ${reason}` }, { status: 502 });
    }

    return NextResponse.json(toChallenge(draft) satisfies SentenceChallenge);
  } catch (error) {
    console.error("Sentence failed", error);
    return NextResponse.json({ error: "Could not build a sentence" }, { status: 502 });
  }
}
