#!/usr/bin/env node
// One-off: generate the "Honey Bird" builder-credit mascot icon via fal.ai.
// Run with: node scripts/generate-honeybird.mjs

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

const PROMPT =
  "cute chibi sticker-style mascot logo of a small bright golden-yellow bird flying, wings spread wide " +
  "mid-flap, dynamic side-angle flying pose, clamping a golden hexagonal honeycomb piece directly in its " +
  "beak, honey dripping off the honeycomb through the air, bold thick clean dark outlines, flat vector " +
  "shapes, vibrant saturated warm colors, simple readable silhouette even at tiny size, plain solid warm " +
  "cream / pale golden background, bright and cheerful lighting, no text, no watermark, mascot app-icon " +
  "style";

async function main() {
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: PROMPT,
      aspect_ratio: "1:1",
      num_images: 4,
      output_format: "png",
      safety_tolerance: "2",
    }),
  });
  if (!res.ok) throw new Error(`fal.ai request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const images = data.images ?? [];
  if (!images.length) throw new Error(`no images returned: ${JSON.stringify(data)}`);

  const outDir = path.resolve(process.cwd(), "public/art");
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < images.length; i++) {
    const imgRes = await fetch(images[i].url);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const outPath = path.join(outDir, `honeybird-source-${i}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`saved ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
