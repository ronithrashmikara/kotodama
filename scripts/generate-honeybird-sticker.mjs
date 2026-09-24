// One-off: the Honey Bird mascot redrawn as a sticker, in the same style as the
// sticker book, from the existing bird as reference (so it stays the same bird).
//
//   node scripts/generate-honeybird-sticker.mjs          # → recordings/honeybird-takes/*.png
//   node scripts/generate-honeybird-sticker.mjs pick 2   # → public/art/honeybird-sticker.webp/png
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
const TAKES = path.join(root, "recordings/honeybird-takes");
fs.mkdirSync(TAKES, { recursive: true });
const auth = { Authorization: `Key ${FAL_KEY}` };

const PROMPT =
  "Redraw this exact bird as a cute kawaii die-cut sticker: the same orange bird with a cream belly and " +
  "layered orange wing feathers, flying, holding a small golden honeycomb in its beak, with a friendly happy eye. " +
  "A thick clean white border runs all the way around the shape. Soft cel shading, simple bold rounded shapes, " +
  "bright cheerful candy colours. One sticker, centred, filling most of the frame, on a transparent background. " +
  "No text, no letters, no words.";

async function run(model, input) {
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`${model}: submit ${submit.status} ${await submit.text()}`);
  const job = await submit.json();
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const status = await (await fetch(job.status_url, { headers: auth })).json();
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "ERROR") throw new Error(JSON.stringify(status));
  }
  const result = await (await fetch(job.response_url, { headers: auth })).json();
  const url = result.images?.[0]?.url;
  if (!url) throw new Error(`no image: ${JSON.stringify(result).slice(0, 300)}`);
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

const square = (png, size, pad) =>
  sharp(png)
    .trim({ threshold: 1 })
    .resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });

if (process.argv[2] === "pick") {
  const png = fs.readFileSync(path.join(TAKES, `take-${process.argv[3]}.png`));
  await square(png, 512, 12).webp({ quality: 90 }).toFile(path.join(root, "public/art/honeybird-sticker.webp"));
  await square(png, 512, 12).png().toFile(path.join(root, "public/art/honeybird-sticker.png"));
  console.log("honey bird placed");
} else {
  // The keyed mascot frame (transparent) as the reference, flattened onto white.
  const ref = await sharp(path.join(root, "indser/video/seq/mascot/0001.png")).flatten({ background: "#ffffff" }).png().toBuffer();
  const refUrl = `data:image/png;base64,${ref.toString("base64")}`;
  const takes = await Promise.allSettled(
    [1, 2, 3].map(() =>
      run("openai/gpt-image-2.5/sunburst/edit", {
        prompt: PROMPT,
        image_urls: [refUrl],
        background: "transparent",
        quality: "high",
        image_size: "square",
        output_format: "png",
      }),
    ),
  );
  takes.forEach((t, i) => {
    if (t.status === "fulfilled") {
      fs.writeFileSync(path.join(TAKES, `take-${i + 1}.png`), t.value);
      console.log(`drew take-${i + 1}.png`);
    } else console.log(`take-${i + 1} failed: ${String(t.reason).slice(0, 300)}`);
  });
}
