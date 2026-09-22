import { NextResponse } from "next/server";

import { chatJson } from "@/lib/groq";

export const runtime = "nodejs";

type ChoicesRequest = {
  scene: string;
  /** Recent picks, so the story doesn't circle back on itself. */
  recent?: string[];
};

export type Choice = {
  /** The option as the player reads it — kana only, no kanji. */
  kana: string;
  /** Revealed only after they've had a fair chance to read it themselves. */
  english: string;
  /** English fragment appended to the Orbis prompt when picked. */
  sceneAddEn: string;
};

export type ChoicesReply = { choices: Choice[] };

// Kanji would defeat the point: this mode exists so a beginner (or a judge who
// reads no Japanese) can still play, reading kana and guessing from context.
const KANJI = /[一-龯㐀-䶿]/;

const SYSTEM = `You write branching choices for a dreamlike Japanese world in a
language-learning game. Given the scene, offer the player TWO different things
they could make happen next.

Hard rules for "kana":
- HIRAGANA and KATAKANA ONLY. Absolutely no kanji, ever. Write 猫 as ねこ,
  雨 as あめ, 空 as そら.
- Short and simple — 3 to 8 characters of actual content, JLPT N5 vocabulary.
- Phrase it as the thing that happens, not as a command. Use spaces between
  words to help a beginner parse it (e.g. "ねこが ねる").

The two options must:
- be clearly DIFFERENT from each other, so the choice feels real
- both fit the scene and never contradict what is already there
- both be things that visibly change the picture
- differ from the recent picks you are shown

Respond ONLY with compact JSON, no markdown fences:
{"choices": [{"kana": "...", "english": "a short natural English rendering", "sceneAddEn": "a short vivid English phrase describing the visual change"}, {"kana": "...", "english": "...", "sceneAddEn": "..."}]}`;

export async function POST(request: Request) {
  let body: ChoicesRequest;
  try {
    body = (await request.json()) as ChoicesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  const ask = (note: string) =>
    chatJson<ChoicesReply>({
      apiKey,
      system: SYSTEM,
      user: `The scene right now: ${scene}

Recently chosen (offer something else): ${
        body.recent?.length ? body.recent.join(" | ") : "(nothing yet)"
      }${note}`,
      temperature: 0.85,
      maxTokens: 450,
    });

  try {
    let reply = await ask("");

    // Models slip kanji in despite the instruction, and one 猫 makes the mode
    // unreadable for exactly the beginner it exists for. Ask once more before
    // giving up.
    if (reply.choices?.some((c) => KANJI.test(c.kana ?? ""))) {
      reply = await ask(
        "\n\nYour previous answer contained kanji, which is not allowed. Rewrite using ONLY hiragana and katakana.",
      );
    }

    const choices = (reply.choices ?? [])
      .filter((c) => c?.kana && c?.sceneAddEn && !KANJI.test(c.kana))
      .slice(0, 2);

    if (choices.length < 2) throw new Error("did not get two kana-only choices");
    return NextResponse.json({ choices });
  } catch (caught) {
    console.error("Choices failed", caught);
    return NextResponse.json({ error: "Could not offer choices" }, { status: 502 });
  }
}
