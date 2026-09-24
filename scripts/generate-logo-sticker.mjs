// One-off: Yume's logo, a sakura flower drawn as a sticker in the same style as
// the sticker book (scripts/generate-stickers.mjs), so the mark and the
// stickers look like one set. Draws a few takes to choose from.
//
//   node scripts/generate-logo-sticker.mjs          # → recordings/logo-takes/*.png
//   node scripts/generate-logo-sticker.mjs pick 2   # → public/art/sakura-sticker*.webp/png, app/icon.png
//
// Reads FAL_KEY from .env.local, and never logs it.
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
const TAKES = path.join(root, "recordings/logo-takes");
fs.mkdirSync(TAKES, { recursive: true });

const MODEL = "openai/gpt-image-2.5/sunburst/text-to-image";
const auth = { Authorization: `Key ${FAL_KEY}` };
const DRAWINGS = [
  "a single big five-petal pink sakura cherry blossom flower with a happy little smiling face in its golden centre, rosy cheeks",
  "a single big five-petal pink sakura cherry blossom flower, soft pink petals with a notch at each tip, a golden centre with little stamens, two tiny sparkles beside it",
];
const prompt = (draw) =>
  `A cute kawaii die-cut sticker of ${draw}. A thick clean white border runs all the way around the shape. ` +
  "Soft cel shading, simple bold rounded shapes, bright cheerful candy colours. " +
  "One sticker, centred, filling most of the frame, on a transparent background. No text, no letters, no words.";

async function draw(text) {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt(text), background: "transparent", quality: "high", image_size: "square", output_format: "png" }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status} ${await submit.text()}`);
  const job = await submit.json();
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const status = await (await fetch(job.status_url, { headers: auth })).json();
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "ERROR") throw new Error(JSON.stringify(status));
  }
  const result = await (await fetch(job.response_url, { headers: auth })).json();
  const url = result.images?.[0]?.url;
  if (!url) throw new Error(`no image: ${JSON.stringify(result).slice(0, 200)}`);
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

const square = (png, size, pad) =>
  sharp(png)
    .trim({ threshold: 1 })
    .resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });

if (process.argv[2] === "pick") {
  const png = fs.readFileSync(path.join(TAKES, `take-${process.argv[3]}.png`));
  await square(png, 512, 16).webp({ quality: 90 }).toFile(path.join(root, "public/art/sakura-sticker.webp"));
  await square(png, 512, 16).png().toFile(path.join(root, "public/art/sakura-sticker.png"));
  // The browser tab icon: the same sticker, tight to its edge.
  await square(png, 256, 4).png().toFile(path.join(root, "app/icon.png"));
  console.log("logo placed");
} else {
  let n = 0;
  await Promise.all(
    [...DRAWINGS, ...DRAWINGS].map(async (d) => {
      const png = await draw(d);
      const file = path.join(TAKES, `take-${++n}.png`);
      fs.writeFileSync(file, png);
      console.log("drew", path.basename(file));
    }),
  );
}
