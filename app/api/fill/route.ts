import { NextResponse } from "next/server";

import { chatJson, hasModel } from "@/lib/llm";

export const runtime = "nodejs";

type FillRequest = {
  scene: string;
  recent?: string[];
};

export type FillOption = {
  /** The word that goes in the gap. Kana only. */
  kana: string;
  english: string;
  /** English fragment appended to the Orbis prompt if this one is picked. */
  sceneAddEn: string;
};

export type FillFrame = {
  /** The sentence with a literal ___ where the word goes, e.g. "ねこが ___". */
  frameKana: string;
  /** The frame in English, gap included, e.g. "the cat ___". */
  frameEn: string;
  options: FillOption[];
};

const KANJI = /[一-龯㐀-䶿]/;

// No option is "wrong" — whichever they choose is what happens. This rung is
// about supplying meaning inside a frame someone else built, not about being
// marked. Particles live in the frame, so the learner meets は and が long
// before anyone explains them.
const SYSTEM = `You write fill-the-gap sentences for a beginner in a living Japanese video world.

Given the scene, write ONE simple sentence frame with exactly one gap, and
THREE different words that could fill it. Every one of the three must make
sense and be something that would visibly change the picture — none of them is
a wrong answer.

Hard rules:
- HIRAGANA and KATAKANA ONLY, everywhere. Never any kanji. Write 猫 as ねこ,
  降る as ふる, 寝る as ねる.
- "frameKana" contains exactly one gap written as three underscores: ___
- Keep the frame to 2-4 words plus the gap, JLPT N5, with a particle (が or は)
  so the learner absorbs sentence shape.
- The three options must be clearly different from each other.
- Options are single words, 2-5 kana, no particles.

Respond ONLY with compact JSON, no markdown fences:
{"frameKana":"ねこが ___","frameEn":"the cat ___","options":[{"kana":"ねる","english":"sleeps","sceneAddEn":"the cat curls up and falls asleep"},{"kana":"はしる","english":"runs","sceneAddEn":"the cat bounds away across the grass"},{"kana":"なく","english":"cries out","sceneAddEn":"the cat looks up and miaows"}]}`;

export async function POST(request: Request) {
  let body: FillRequest;
  try {
    body = (await request.json()) as FillRequest;
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
    chatJson<FillFrame>({
      system: SYSTEM,
      user:
        `Scene: ${scene}\n\n` +
        (recent.length ? `Recently already happened, go somewhere new: ${recent.join(". ")}\n\n` : "") +
        `Write the frame and three options.${extra}`,
      temperature: 0.8,
      maxTokens: 500,
    });

  const hasKanji = (f: FillFrame) =>
    KANJI.test(f?.frameKana ?? "") || (f?.options ?? []).some((o) => KANJI.test(o.kana ?? ""));

  try {
    let frame = await ask();
    if (hasKanji(frame)) {
      frame = await ask("\n\nYour previous answer contained kanji, which is not allowed. Use kana only.");
    }

    const options = (frame?.options ?? []).filter((o) => o?.kana && !KANJI.test(o.kana)).slice(0, 3);
    if (!frame?.frameKana?.includes("___") || options.length < 2) {
      return NextResponse.json({ error: "Could not produce a usable frame" }, { status: 502 });
    }

    return NextResponse.json({
      frameKana: frame.frameKana,
      frameEn: frame.frameEn ?? "",
      options,
    } satisfies FillFrame);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fill lookup failed" },
      { status: 502 },
    );
  }
}
