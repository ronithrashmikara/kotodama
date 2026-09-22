#!/usr/bin/env node
// One-off: animate public/art/hero.jpg into a short looping clip via fal.ai's
// MiniMax Hailuo-02 (standard, 512P, 10s) — the cheapest tier that supports a
// 10-second duration (~$0.17/generation). Run with: node scripts/generate-hero-video.mjs

import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

const MODEL = "fal-ai/minimax/hailuo-02/standard/image-to-video";
const heroPath = path.resolve(process.cwd(), "public/art/hero.jpg");
const imageBuf = fs.readFileSync(heroPath);
const imageDataUri = `data:image/jpeg;base64,${imageBuf.toString("base64")}`;

const PROMPT =
  "Gentle ambient motion, slow cinematic drift: cherry blossom petals drifting through the air, " +
  "the two girls' hair and skirts swaying softly in the breeze, soft clouds slowly rolling below the " +
  "floating path, the huge moon glowing with a gentle pulse, camera almost static with only a very " +
  "slight slow push in, dreamlike and calm, seamless loopable motion, no sudden movement, no text";

async function submit() {
  const res = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: PROMPT,
      image_url: imageDataUri,
      duration: "10",
      resolution: "512P",
      prompt_optimizer: true,
    }),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function pollStatus(statusUrl) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!res.ok) throw new Error(`status check failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    console.log(`  status: ${data.status}`);
    if (data.status === "COMPLETED") return;
    if (data.status === "ERROR" || data.status === "FAILED") {
      throw new Error(`generation failed: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("timed out waiting for video generation");
}

async function main() {
  console.log("→ submitting hero animation job…");
  const submitted = await submit();
  console.log(`  request_id: ${submitted.request_id}`);
  await pollStatus(submitted.status_url);

  console.log("→ fetching result…");
  const resultRes = await fetch(submitted.response_url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  if (!resultRes.ok) throw new Error(`result fetch failed: ${resultRes.status} ${await resultRes.text()}`);
  const result = await resultRes.json();
  const videoUrl = result.video?.url;
  if (!videoUrl) throw new Error(`no video URL in result: ${JSON.stringify(result)}`);

  const videoRes = await fetch(videoUrl);
  const buf = Buffer.from(await videoRes.arrayBuffer());
  const outPath = path.resolve(process.cwd(), "public/art/hero.mp4");
  fs.writeFileSync(outPath, buf);
  console.log(`  saved ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
