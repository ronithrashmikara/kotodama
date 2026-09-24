import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";

export const runtime = "nodejs";

type ChoicesRequest = {
  scene: string;
  /** Recent picks, so the story doesn't circle back on itself. */
  recent?: string[];
  learn?: Learn;
};

export type Choice = {
  /** The option as the player reads it — kana only, no kanji. In English mode, simple English. */
  kana: string;
  /** Revealed only after they've had a fair chance to read it themselves. In English mode, Japanese. */
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

// The same choice for a Japanese-speaking child learning English: they read
// the English, and the Japanese is what shows up if they wait for it.
const SYSTEM_EN = `You write branching choices for a dreamlike world in a game where a young
Japanese-speaking child is learning English. Given the scene, offer the player
TWO different things they could make happen next.

Hard rules for "text":
- Very simple English a child learns first: 2 to 4 words, present simple,
  lower case, no full stop (e.g. "the cat sleeps", "stars shine").
- Phrase it as the thing that happens, not as a command.

The two options must:
- be clearly DIFFERENT from each other, so the choice feels real
- both fit the scene and never contradict what is already there
- both be things that visibly change the picture
- differ from the recent picks you are shown

Respond ONLY with compact JSON, no markdown fences:
{"choices": [{"text": "...", "meaning": "the same thing in correct, natural Japanese written in hiragana and katakana, with spaces between words, e.g. はくちょうが およぐ", "sceneAddEn": "a short vivid English phrase describing the visual change"}, {"text": "...", "meaning": "...", "sceneAddEn": "..."}]}`;

const SIMPLE_ENGLISH = /^[A-Za-z][A-Za-z ,'!.-]*$/;

export async function POST(request: Request) {
  let body: ChoicesRequest;
  try {
    body = (await request.json()) as ChoicesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });

  if (!hasModel()) {
    return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });
  }

  const ask = (note: string) =>
    chatJson<ChoicesReply>({
      system: SYSTEM,
      user: `The scene right now: ${scene}

Recently chosen (offer something else): ${
        body.recent?.length ? body.recent.join(" | ") : "(nothing yet)"
      }${note}`,
      temperature: 0.85,
      maxTokens: 450,
    });

  if (asLearn(body.learn) === "en") {
    try {
      const reply = await chatJson<{ choices?: { text?: string; meaning?: string; sceneAddEn?: string }[] }>({
        system: SYSTEM_EN,
        user: `The scene right now: ${scene}

Recently chosen (offer something else): ${body.recent?.length ? body.recent.join(" | ") : "(nothing yet)"}`,
        temperature: 0.85,
        maxTokens: 450,
      });
      const choices: Choice[] = (reply.choices ?? [])
        .filter((c) => c?.text && c?.sceneAddEn && SIMPLE_ENGLISH.test(c.text.trim()))
        .slice(0, 2)
        .map((c) => ({ kana: c.text!.trim(), english: c.meaning?.trim() ?? "", sceneAddEn: c.sceneAddEn! }));
      if (choices.length < 2) throw new Error("did not get two simple English choices");
      return NextResponse.json({ choices });
    } catch (caught) {
      console.error("Choices failed", caught);
      return NextResponse.json({ error: "Could not offer choices" }, { status: 502 });
    }
  }

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
