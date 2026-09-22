#!/usr/bin/env node
// Generates the reference frame Orbis is conditioned on in companion mode.
//
// Without an anchor image, every set_prompt lets Orbis reinvent the character.
// This gives it a fixed first frame; lib/companion.ts carries the matching
// text description so the look survives later steers too.
//
//   node scripts/generate-companion.mjs

import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

const MODEL = "fal-ai/flux-pro/v1.1-ultra";

// Must stay in sync with COMPANION_LOOK in lib/companion.ts.
const PROMPT =
  "anime key visual, a gentle teenage girl companion standing in a quiet park at " +
  "golden hour under cherry blossom trees, shoulder-length chestnut brown hair with " +
  "a single small white flower pin above her left ear, warm amber eyes, wearing a " +
  "soft cream cardigan over a white collared blouse and a dusty-blue pleated skirt, " +
  "a thin red cord bracelet on her right wrist, calm friendly expression looking " +
  "slightly toward the viewer, full body visible, centred in frame, painterly " +
  "studio-anime background art, soft warm light, cinematic, no text, no watermark";

async function main() {
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: PROMPT,
      aspect_ratio: "16:9",
      num_images: 4,
      output_format: "jpeg",
      safety_tolerance: "2",
    }),
  });
  if (!res.ok) throw new Error(`fal.ai failed: ${res.status} ${await res.text()}`);
  const images = (await res.json()).images ?? [];
  if (!images.length) throw new Error("no images returned");

  const outDir = path.resolve(process.cwd(), "public/art");
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < images.length; i++) {
    const buf = Buffer.from(await (await fetch(images[i].url)).arrayBuffer());
    const out = path.join(outDir, `companion-source-${i}.jpg`);
    fs.writeFileSync(out, buf);
    console.log(`saved ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
