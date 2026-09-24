import { NextResponse } from "next/server";

import type { NarrationToken } from "@/app/api/narrate/route";
import { COMPANION_SYSTEM, COMPANION_SYSTEM_EN } from "@/lib/companion";
import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";
import { getLevel, rungBrief } from "@/lib/levels";

export const runtime = "nodejs";

type Turn = { role: "you" | "companion"; text: string };

type CompanionRequest = {
  said?: string;
  scene: string;
  level?: number;
  history?: Turn[];
  /** The player has just arrived and said nothing yet — Hina speaks first. */
  greeting?: boolean;
  learn?: Learn;
  /** Plain-English lines about this player's earlier dreams (lib/dreams.ts). */
  memories?: string[];
};

const GREETING =
  "(The player has just arrived beside you and has not said anything yet. Greet them warmly in one short line and point out one thing you can both see, so they have something to answer.)";

/**
 * `reply` is in the language being learned; `replyEn` and `heardMeaning` are in
 * the helper language — Japanese, when the player is learning English.
 */
export type CompanionReply = {
  /** What the player said to her, in the helper language: their words turn into it. */
  heardMeaning?: string;
  reply: string;
  replyEn: string;
  sceneAddEn: string;
  tokens: NarrationToken[];
};

export async function POST(request: Request) {
  let body: CompanionRequest;
  try {
    body = (await request.json()) as CompanionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const said = body.greeting ? GREETING : body.said?.trim();
  if (!said) return NextResponse.json({ error: "said is required" }, { status: 400 });

  if (!hasModel()) {
    return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });
  }

  const learn = asLearn(body.learn);
  const level = getLevel(body.level ?? 1);
  // Only the last few turns — this sits in the live loop, so the prompt stays
  // small enough to keep the reply fast.
  const history = (body.history ?? [])
    .slice(-6)
    .map((t) => `${t.role === "you" ? "Player" : "You"}: ${t.text}`)
    .join("\n");

  // She remembers them: brought up warmly once, in the greeting, or when it
  // fits — never recited.
  const memories = body.memories?.length
    ? `What you remember from earlier dreams with this player:\n${body.memories
        .slice(0, 3)
        .map((m) => `- ${m}`)
        .join("\n")}\n${
        body.greeting
          ? 'Your greeting MUST bring up ONE of these memories, simply and happily, like a friend who remembers ("Last time you made a whale jump!"), and then point out one thing you can both see.'
          : "Bring a memory up only if it fits naturally."
      }\n\n`
    : "";

  try {
    const result = await chatJson<CompanionReply & { replyMeaning?: string }>({
      system: learn === "en" ? COMPANION_SYSTEM_EN : COMPANION_SYSTEM,
      user: `The player's ${learn === "en" ? "English" : "Japanese"} level: ${level.nameEn}. ${rungBrief(level, learn).narrationBrief}

What you can both see right now: ${body.scene || "(a quiet, undefined place)"}

${history ? `Recent conversation:\n${history}\n` : ""}${memories}
The player just said: ${said}`,
      temperature: 0.8,
      // Replies are one or two sentences plus their glosses. A tight cap
      // matters because this call sits between the player speaking and the
      // world reacting.
      maxTokens: 800,
    });

    if (!result.reply) throw new Error("companion response missing reply");
    const tokens = Array.isArray(result.tokens) ? result.tokens : [];
    return NextResponse.json({
      heardMeaning: body.greeting ? "" : result.heardMeaning ?? "",
      // In English the words are the tokens, so the line is rebuilt from them.
      reply: learn === "en" && tokens.length ? tokens.map((t) => t.surface.trim()).join(" ") : result.reply,
      replyEn: (learn === "en" ? result.replyMeaning : result.replyEn) ?? "",
      sceneAddEn: result.sceneAddEn ?? "",
      tokens,
    });
  } catch (caught) {
    console.error("Companion failed", caught);
    return NextResponse.json({ error: "The companion could not answer" }, { status: 502 });
  }
}
