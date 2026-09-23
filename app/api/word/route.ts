import { NextResponse } from "next/server";

import { chatJson } from "@/lib/groq";
import { toRomaji } from "@/lib/romaji";

export const runtime = "nodejs";

type WordRequest = {
  scene: string;
  /** Words already taught this session, so the same one is not served twice. */
  taught?: string[];
};

export type EchoWord = {
  /** Kana only — this rung is for people who cannot read kanji. */
  kana: string;
  romaji: string;
  english: string;
  /** English fragment appended to the Orbis prompt once they say it. */
  sceneAddEn: string;
  /**
   * Other spellings that should count as saying this word — above all the
   * kanji. Speech recognition runs in ja-JP and returns 猫, not ねこ.
   */
  accept: string[];
};

const KANJI = /[一-龯㐀-䶿]/;

// The word has to be something ALREADY visible in the world, because the whole
// point of this rung is that the learner binds a sound to a thing they can see.
// Teaching a word for something off-screen would make it a flashcard.
const SYSTEM = `You teach ONE Japanese word to an absolute beginner inside a living video world.

Given the scene, choose a single concrete noun that is clearly VISIBLE in it
right now — an animal, an object, a weather element, a place feature. Not an
abstract idea, not a verb, not an adjective.

Hard rules for "kana":
- HIRAGANA or KATAKANA ONLY. Never any kanji. Write 猫 as ねこ, 雨 as あめ,
  空 as そら, 木 as き.
- One word only. No particles, no spaces, 2-5 characters.
- The most common, everyday JLPT N5 word for the thing.

"sceneAddEn" is a short vivid English phrase that brings that thing FORWARD in
the picture when the learner says the word — it should read as the world
responding to them, e.g. "the cat walks toward the viewer and sits down", "rain
begins to fall softly across the scene".

"accept" lists other ways the SAME word may be written, most importantly its
normal kanji spelling, plus katakana if that is also common. Speech recognition
transcribes into kanji, so this is what makes a correct answer count.

Respond ONLY with compact JSON, no markdown fences:
{"kana":"ねこ","romaji":"neko","english":"cat","sceneAddEn":"the cat pads toward you and sits down","accept":["猫","ネコ"]}`;

export async function POST(request: Request) {
  let body: WordRequest;
  try {
    body = (await request.json()) as WordRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 500 });
  }

  const taught = (body.taught ?? []).filter(Boolean);
  const ask = (extra = "") =>
    chatJson<EchoWord>({
      apiKey,
      system: SYSTEM,
      user:
        `Scene: ${scene}\n\n` +
        (taught.length ? `Already taught, pick something different: ${taught.join(", ")}\n\n` : "") +
        `Choose one visible thing and teach its word.${extra}`,
      temperature: 0.7,
      maxTokens: 260,
    });

  try {
    let word = await ask();

    // Same guard as choice mode: the model will reach for kanji unless it is
    // caught and told again.
    if (KANJI.test(word.kana ?? "")) {
      word = await ask("\n\nYour previous answer contained kanji, which is not allowed. Use kana only.");
    }
    if (!word?.kana || KANJI.test(word.kana)) {
      return NextResponse.json({ error: "Could not produce a kana-only word" }, { status: 502 });
    }

    return NextResponse.json({
      kana: word.kana,
      // Trust our own transliteration over the model's — it is deterministic,
      // and the romaji is what a beginner will actually try to pronounce.
      romaji: toRomaji(word.kana) || word.romaji || "",
      english: word.english ?? "",
      sceneAddEn: word.sceneAddEn ?? "",
      accept: (word.accept ?? []).filter((a) => typeof a === "string" && a.trim()),
    } satisfies EchoWord);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Word lookup failed" },
      { status: 502 },
    );
  }
}
