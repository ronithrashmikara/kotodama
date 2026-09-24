import { NextResponse } from "next/server";

import { chatJson } from "@/lib/groq";

export const runtime = "nodejs";

type HeardRequest = {
  /** What speech recognition transcribed. */
  said: string;
  /** What the learner was asked to say, in kana. */
  target: string;
  english?: string;
};

// The on-device matcher is instant and right almost every time, but it only
// knows the spellings it was given. The recogniser sometimes picks another:
// 差す for さす, a homophone, a kanji compound nobody listed. Telling a
// beginner they were wrong when they said it perfectly is the worst mistake
// this game can make — so when the matcher says no, this asks once more.
// It only ever runs on a miss, so a clean attempt stays instant.
const SYSTEM = `A beginner was asked to say a Japanese word or short sentence out loud, and speech recognition transcribed what they said.

Decide whether the transcription IS the target: the same words, allowing
- any script (kanji, hiragana, katakana, romaji), including a kanji or homophone the recogniser chose,
- a different verb ending (plain or polite, e.g. ふる / ふります),
- missing or extra particles, and extra filler words around it.

Say false if any content word of the target is missing or different, or the transcription is unrelated.

Respond ONLY with compact JSON, no markdown fences: {"ok": true} or {"ok": false}`;

export async function POST(request: Request) {
  let body: HeardRequest;
  try {
    body = (await request.json()) as HeardRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const said = body.said?.trim().slice(0, 200);
  const target = body.target?.trim().slice(0, 100);
  if (!said || !target) return NextResponse.json({ error: "said and target are required" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, method: "unavailable" });

  try {
    const result = await chatJson<{ ok?: boolean }>({
      apiKey,
      system: SYSTEM,
      user: `Target: ${target}${body.english ? ` ("${body.english}")` : ""}\nTranscription: ${said}`,
      temperature: 0,
      maxTokens: 200,
    });
    return NextResponse.json({ ok: result.ok === true, method: "groq" });
  } catch (error) {
    console.error("Heard check failed", error);
    return NextResponse.json({ ok: false, method: "error" });
  }
}
