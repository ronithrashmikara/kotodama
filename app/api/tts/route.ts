import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Same sweet, gentle anime-style Japanese voice used in the Japanese Reader
// project, via Fish Audio's free s2.1-pro-free model.
const JP_VOICE_ID = "be67ba79424149ec8a4564cebd3e7938";
const FISH_MODEL = "s2.1-pro-free";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text")?.trim();
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FISH_API_KEY is not configured" },
      { status: 500 },
    );
  }

  try {
    const resp = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: FISH_MODEL,
      },
      body: JSON.stringify({
        text,
        reference_id: JP_VOICE_ID,
        format: "mp3",
        mp3_bitrate: 128,
        normalize: true,
        latency: "normal",
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `Fish Audio error ${resp.status}: ${errText.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (caught) {
    console.error("TTS proxy failed", caught);
    return NextResponse.json({ error: "TTS request failed" }, { status: 502 });
  }
}
