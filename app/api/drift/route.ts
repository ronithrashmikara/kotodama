import { NextResponse } from "next/server";

import { chatJson } from "@/lib/groq";

export const runtime = "nodejs";

type DriftRequest = {
  scene: string;
  /** Recent ambient changes, so the world doesn't repeat itself. */
  recent?: string[];
  /** Ask for a beat that needs the player to act. */
  stakes?: boolean;
};

export type Drift = {
  /** English fragment appended to the Orbis prompt. */
  sceneAddEn: string;
  /** Short English line describing what just happened, for the player. */
  event: string;
  /** Only present when stakes were requested. */
  urgent?: boolean;
};

const AMBIENT = `You are the ambient director of a living, dreamlike Japanese world in a
language-learning game. The world keeps moving whether or not the player acts.

Given the scene as it stands, invent ONE small, natural thing that happens
next on its own — a shift in light or weather, an animal moving, petals
falling, a distant sound, someone passing by. It must:
- be a SMALL change, not a new setting or a dramatic twist
- fit what is already there and never contradict it
- never undo or remove something the player created
- differ from the recent changes you are shown

Respond ONLY with compact JSON, no markdown fences:
{"sceneAddEn": "a short vivid English phrase to append to an image prompt", "event": "a short plain-English sentence telling the player what just happened, max 12 words"}`;

const STAKES = `You are the ambient director of a living, dreamlike Japanese world in a
language-learning game, and it is time for something that needs the player.

Given the scene as it stands, invent ONE gentle predicament that invites the
player to intervene by speaking Japanese — an animal wandering somewhere
risky, weather about to spoil something, someone who looks lost. It must:
- be solvable by the player SAYING something, not by physical action
- stay gentle and dreamlike; nothing violent, frightening or cruel
- fit what is already there and never contradict it

Respond ONLY with compact JSON, no markdown fences:
{"sceneAddEn": "a short vivid English phrase to append to an image prompt", "event": "a short plain-English sentence telling the player what is happening and implying they should act, max 16 words", "urgent": true}`;

export async function POST(request: Request) {
  let body: DriftRequest;
  try {
    body = (await request.json()) as DriftRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const drift = await chatJson<Drift>({
      apiKey,
      system: body.stakes ? STAKES : AMBIENT,
      user: `The scene right now: ${scene}

Recent ambient changes (do not repeat these): ${
        body.recent?.length ? body.recent.join(" | ") : "(none yet)"
      }`,
      temperature: 0.9,
      maxTokens: 300,
    });

    if (!drift.sceneAddEn) throw new Error("drift response missing sceneAddEn");
    return NextResponse.json(drift);
  } catch (caught) {
    console.error("Drift failed", caught);
    return NextResponse.json({ error: "Could not advance the world" }, { status: 502 });
  }
}
