#!/usr/bin/env node
// One-off art generation via fal.ai (flux-pro v1.1-ultra, highest quality tier).
// Run with: node scripts/generate-art.mjs
// Reads FAL_KEY from .env.local. Never commit generated art's source prompts
// with real keys embedded, and never log the key itself.

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

const STYLE =
  "beautiful anime key visual, painterly studio-anime background art, soft cinematic lighting, " +
  "detailed, high quality, pastel and warm color palette, dreamlike atmosphere";

const TARGETS = [
  {
    name: "hero",
    aspect_ratio: "21:9",
    prompt:
      `${STYLE}. A dreamlike floating world at dusk, torii gate and cherry blossom petals drifting through the air, ` +
      "two anime girl characters in soft school-uniform-inspired outfits standing back to back on a floating stone path above the clouds, " +
      "gentle wind moving their hair and skirts, glowing fireflies of light, a huge soft moon behind them, " +
      "wide cinematic establishing shot, no text, no watermark",
  },
  {
    name: "park",
    aspect_ratio: "4:3",
    prompt:
      `${STYLE}. A quiet park at golden hour, cherry blossom trees lining a winding path, an anime girl character in a light cardigan ` +
      "sitting on a bench with a small cream cat beside her, warm sunlight through the leaves, no text, no watermark",
  },
  {
    name: "classroom",
    aspect_ratio: "4:3",
    prompt:
      `${STYLE}. A cozy Japanese classroom in the afternoon, an anime girl character in a school uniform standing by a sunlit window ` +
      "with an open book, dust motes drifting in the sunbeam, warm nostalgic mood, no text, no watermark",
  },
  {
    name: "night-city",
    aspect_ratio: "4:3",
    prompt:
      `${STYLE}. A quiet lantern-lit city street at night, an anime girl character in a soft coat walking past warm shopfronts, ` +
      "a huge glowing full moon above, gentle steam rising from a street stall, reflections on cobblestone, no text, no watermark",
  },
];

async function generate({ name, prompt, aspect_ratio }) {
  console.log(`→ generating ${name}…`);
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "2",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai request failed for ${name}: ${res.status} ${text}`);
  }

  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`No image URL returned for ${name}: ${JSON.stringify(data)}`);

  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const outDir = path.resolve(process.cwd(), "public/art");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.jpg`);
  fs.writeFileSync(outPath, buf);
  console.log(`  saved ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
}

for (const target of TARGETS) {
  await generate(target);
}

console.log("Done.");
