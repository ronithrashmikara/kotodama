import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";
import { partsProblem, shapeSentence, type TaughtSentence } from "@/lib/sentence-shape";

export const runtime = "nodejs";

type SentenceRequest = {
  scene: string;
  /** Sentences already said this session, so the world does not repeat itself. */
  recent?: string[];
  learn?: Learn;
};

export type { SentencePart } from "@/lib/sentence-shape";

export type SentenceChallenge = TaughtSentence & {
  /** The one clear step Orbis is steered with when the sentence lands. */
  changeEn: string;
  /** The whole world after that step. It becomes the new base scene. */
  sceneEn: string;
};

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
function problem(learn: Learn, draft: Draft & DraftEn): string | null {
  const parts = partsProblem(learn, draft.parts);
  if (parts) return parts;
  if (!draft.changeEn?.trim() || !draft.sceneEn?.trim()) return "changeEn or sceneEn was missing";
  return null;
}

function toChallenge(learn: Learn, draft: Draft & DraftEn): SentenceChallenge {
  return {
    ...shapeSentence(learn, draft.parts ?? [], (learn === "en" ? draft.meaning : draft.sentenceEn) ?? ""),
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
    const check = (d: Draft & DraftEn) => problem(learn, d);
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

    const challenge = toChallenge(learn, draft);
    return NextResponse.json(challenge satisfies SentenceChallenge);
  } catch (error) {
    console.error("Sentence failed", error);
    return NextResponse.json({ error: "Could not build a sentence" }, { status: 502 });
  }
}
