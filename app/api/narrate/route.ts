import { NextResponse } from "next/server";

import { getLevel } from "@/lib/levels";
import { chatJson } from "@/lib/openrouter";

export const runtime = "nodejs";

type NarrateRequest = {
  scene: string;
  level?: number;
};

export type NarrationToken = {
  surface: string;
  reading: string;
  meaning: string;
};

export type Narration = {
  japanese: string;
  english: string;
  tokens: NarrationToken[];
};

// The model returns the narration already segmented into words. Japanese has
// no spaces, so doing this server-side is what makes each word individually
// hoverable without shipping a morphological analyzer to the browser.
const SYSTEM_INSTRUCTION = `You are the narrator of a living, dreamlike Japanese world in a language-learning
game. You are given an English description of what the scene currently looks
like. Narrate that scene in natural, warm Japanese, as if gently telling the
learner what they can see.

Then break your narration into individual vocabulary units and gloss each one.

Rules:
- Narrate ONLY what the scene description supports. Never invent major new elements.
- Segment into natural vocabulary units: keep a word and its okurigana together
  (たべます), keep compound nouns together (こうえん), and make particles their
  own units (は, が, に, を).
- "reading" is the unit in hiragana/katakana. If the surface form is already
  kana, repeat it.
- "meaning" is a SHORT English gloss, a few words at most. For particles,
  describe the grammatical role (e.g. "topic marker", "location marker").
- The concatenation of every "surface" MUST exactly equal "japanese", including
  any spaces or punctuation.

Respond ONLY with compact JSON, no markdown fences:
{"japanese": "...", "english": "a natural English translation", "tokens": [{"surface": "...", "reading": "...", "meaning": "..."}]}`;

export async function POST(request: Request) {
  let body: NarrateRequest;
  try {
    body = (await request.json()) as NarrateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) {
    return NextResponse.json({ error: "scene is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const level = getLevel(body.level ?? 1);

  try {
    const narration = await chatJson<Narration>({
      apiKey,
      system: SYSTEM_INSTRUCTION,
      user: `Narration length and difficulty for this learner's level: ${level.narrationBrief}

The scene right now: ${scene}`,
      temperature: 0.6,
      maxTokens: 900,
    });

    if (!narration.japanese || !Array.isArray(narration.tokens)) {
      throw new Error("Narration response missing japanese/tokens");
    }

    return NextResponse.json(narration);
  } catch (caught) {
    console.error("Narration failed", caught);
    return NextResponse.json({ error: "Could not narrate the scene" }, { status: 502 });
  }
}
