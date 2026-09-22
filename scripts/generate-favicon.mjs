#!/usr/bin/env node
// One-off: generate a themed favicon/brandmark via fal.ai (flux-pro v1.1-ultra).
// Run with: node scripts/generate-favicon.mjs

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
  "premium minimal app icon logo of a single sakura cherry blossom flower, five rounded petals each " +
  "with a soft notch at the tip like a real cherry blossom, viewed straight-on, perfectly symmetric and " +
  "centered, smooth gradient from warm gold at the flower's core fading into soft sakura pink at the " +
  "petal tips, delicate fine linework outline, subtle soft glow behind the flower, elegant refined " +
  "vector illustration, huge negative space, solid deep near-black background, no text, no watermark, " +
  "premium brand identity design, crisp clean edges, high production value";

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
    const outPath = path.join(outDir, `favicon-source-${i}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`saved ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
