import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { getLevel, rungBrief } from "@/lib/levels";
import { chatJson, hasModel } from "@/lib/llm";

export const runtime = "nodejs";

type NarrateRequest = {
  scene: string;
  level?: number;
  /** What just happened. The narration is about this; the scene is context. */
  change?: string;
  learn?: Learn;
};

export type NarrationToken = {
  surface: string;
  reading: string;
  meaning: string;
};

/**
 * `japanese` is the line in the language being learned and `english` its
 * meaning in the helper language — in English mode, an English line and its
 * Japanese meaning, with one token per word (lib/learn.ts).
 */
export type Narration = {
  japanese: string;
  english: string;
  tokens: NarrationToken[];
};

// Narrating for a Japanese-speaking child learning English.
const SYSTEM_INSTRUCTION_EN = `You are the narrator of a living, dreamlike world in a game where a young
Japanese-speaking child is learning English. You are given an English
description of what the scene looks like. Narrate it in simple, warm English,
as if gently telling the child what they can see.

Then list every word of your narration, in order, and gloss each one.

Rules:
- Narrate ONLY what the scene description supports. Never invent major new elements.
- When you are told what just changed, narrate THAT, as it happens: it is the
  child's reward. The rest of the scene is context only. Mention at most one
  other thing in it, and never list the scene.
- Keep it short enough to say aloud in under ten seconds.
- Each token is ONE word exactly as written in your narration, punctuation
  attached ("moon.", "Look,"). "reading" is how it sounds, in katakana, and
  "meaning" is a short meaning in simple Japanese kana.
- Joining every "surface" with single spaces MUST give back "text" exactly.

Respond ONLY with compact JSON, no markdown fences:
{"text": "...", "meaning": "the whole line translated into simple, natural Japanese a child can read, mostly hiragana: real sentences, never word-by-word glosses", "tokens": [{"surface": "...", "reading": "...", "meaning": "..."}]}`;

async function narrateEnglish(user: string): Promise<Narration> {
  const reply = await chatJson<{ text?: string; meaning?: string; tokens?: NarrationToken[] }>({
    system: SYSTEM_INSTRUCTION_EN,
    user,
    temperature: 0.6,
    maxTokens: 900,
  });
  const tokens = Array.isArray(reply.tokens) ? reply.tokens.filter((t) => t?.surface?.trim()) : [];
  if (!tokens.length) throw new Error("Narration response missing tokens");
  // The tokens are what is shown and hovered, so the line is rebuilt from them.
  return { japanese: tokens.map((t) => t.surface.trim()).join(" "), english: reply.meaning?.trim() ?? "", tokens };
}

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
- When you are told what just changed, narrate THAT, as it happens: it is the
  learner's reward. The rest of the scene is context only. Mention at most one
  other thing in it, and never list the scene.
- Keep it short enough to say aloud in under ten seconds. Never stretch a
  sentence by chaining clause after clause with 、.
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

  if (!hasModel()) {
    return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });
  }

  const learn = asLearn(body.learn);
  const level = rungBrief(getLevel(body.level ?? 1), learn);
  const change = body.change?.trim();
  // The scene grows with every turn. Narrated whole, it became a 160-character
  // paragraph that held the mic for half a minute and outran the token budget.
  const about = change
    ? `What just changed: ${change}

The rest of the scene, for context only: ${scene}`
    : `The scene right now: ${scene}`;

  const user = `Narration length and difficulty for this learner's level: ${level.narrationBrief}

${about}`;

  try {
    if (learn === "en") return NextResponse.json(await narrateEnglish(user));

    const narration = await chatJson<Narration>({
      system: SYSTEM_INSTRUCTION,
      user,
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
