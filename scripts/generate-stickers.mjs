#!/usr/bin/env node
// One-off: the core sticker set, via fal. GPT Image 2.5 draws each concept in
// lib/sticker-set.json as a kawaii die-cut sticker on a transparent
// background; sharp trims it and saves a small webp to public/stickers/.
//
//   node scripts/generate-stickers.mjs            # only the missing ones
//   node scripts/generate-stickers.mjs whale moon # redo these
//   node scripts/generate-stickers.mjs --all      # redo everything
//
// Reads FAL_KEY from .env.local, and never logs it. Originals are kept in
// recordings/stickers-src/ (gitignored) so a sticker can be re-cut for free.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

const SET = JSON.parse(fs.readFileSync(path.join(root, "lib/sticker-set.json"), "utf8"));
const OUT = path.join(root, "public/stickers");
const SRC = path.join(root, "recordings/stickers-src");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

const args = process.argv.slice(2);
const all = args.includes("--all");
const named = args.filter((a) => !a.startsWith("--"));
const todo = SET.filter((s) =>
  named.length ? named.includes(s.id) : all || !fs.existsSync(path.join(OUT, `${s.id}.webp`)),
);
console.log(`${todo.length} of ${SET.length} stickers to draw`);

const MODEL = "openai/gpt-image-2.5/sunburst/text-to-image";
const auth = { Authorization: `Key ${FAL_KEY}` };

// The same words the on-the-fly stickers use (app/api/sticker), so the two
// sets sit together in one album.
const prompt = (draw) =>
  `A cute kawaii die-cut sticker of ${draw}. A thick clean white border runs all the way around the shape. ` +
  "Soft cel shading, simple bold rounded shapes, bright cheerful candy colours, big friendly eyes where it has a face. " +
  "One sticker, centred, filling most of the frame, on a transparent background. No text, no letters, no words.";

async function draw(sticker) {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt(sticker.draw),
      background: "transparent",
      quality: "medium",
      image_size: "square",
      output_format: "png",
    }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status} ${await submit.text()}`);
  const job = await submit.json();
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const status = await (await fetch(job.status_url, { headers: auth })).json();
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "ERROR") throw new Error(JSON.stringify(status));
  }
  const result = await (await fetch(job.response_url, { headers: auth })).json();
  const url = result.images?.[0]?.url;
  if (!url) throw new Error(`no image: ${JSON.stringify(result).slice(0, 200)}`);
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(SRC, `${sticker.id}.png`), png);
  return png;
}

// Trimmed to the sticker's own edge, then centred in a square with a little
// air, so every sticker sits at the same size in the album.
async function cut(png, id) {
  const webp = await sharp(png)
    .trim({ threshold: 1 })
    .resize(272, 272, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, `${id}.webp`), webp);
  return webp.length;
}

// Four at a time: fal queues the rest, and a failure only costs its sticker.
const queue = [...todo];
const failed = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const sticker = queue.shift();
      const t = Date.now();
      try {
        const bytes = await cut(await draw(sticker), sticker.id);
        console.log(`  ${sticker.id.padEnd(16)} ${(bytes / 1024).toFixed(1)} KB  ${((Date.now() - t) / 1000).toFixed(0)}s`);
      } catch (e) {
        failed.push(sticker.id);
        console.log(`  ${sticker.id.padEnd(16)} FAILED ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      }
    }
  }),
);
if (failed.length) {
  console.log(`failed: ${failed.join(" ")} — run again with these ids`);
  process.exit(1);
}
