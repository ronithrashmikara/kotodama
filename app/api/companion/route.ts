import { NextResponse } from "next/server";

import type { NarrationToken } from "@/app/api/narrate/route";
import { COMPANION_SYSTEM } from "@/lib/companion";
import { chatJson } from "@/lib/groq";
import { getLevel } from "@/lib/levels";

export const runtime = "nodejs";

type Turn = { role: "you" | "companion"; text: string };

type CompanionRequest = {
  said: string;
  scene: string;
  level?: number;
  history?: Turn[];
};

export type CompanionReply = {
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

  const said = body.said?.trim();
  if (!said) return NextResponse.json({ error: "said is required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  const level = getLevel(body.level ?? 1);
  // Only the last few turns — this sits in the live loop, so the prompt stays
  // small enough to keep the reply fast.
  const history = (body.history ?? [])
    .slice(-6)
    .map((t) => `${t.role === "you" ? "Player" : "You"}: ${t.text}`)
    .join("\n");

  try {
    const result = await chatJson<CompanionReply>({
      apiKey,
      system: COMPANION_SYSTEM,
      user: `The player's Japanese level: ${level.nameEn}. ${level.narrationBrief}

What you can both see right now: ${body.scene || "(a quiet, undefined place)"}

${history ? `Recent conversation:\n${history}\n` : ""}
The player just said: ${said}`,
      temperature: 0.8,
      // Replies are one or two sentences plus their glosses. A tight cap
      // matters because this call sits between the player speaking and the
      // world reacting.
      maxTokens: 500,
    });

    if (!result.reply) throw new Error("companion response missing reply");
    return NextResponse.json({
      reply: result.reply,
      replyEn: result.replyEn ?? "",
      sceneAddEn: result.sceneAddEn ?? "",
      tokens: Array.isArray(result.tokens) ? result.tokens : [],
    });
  } catch (caught) {
    console.error("Companion failed", caught);
    return NextResponse.json({ error: "The companion could not answer" }, { status: 502 });
  }
}
