#!/usr/bin/env node
// One-off: the README's artwork, via fal.ai.
//   - banner-still.png   GPT Image 2.5 Sunburst paints the scene (no text: it gets animated)
//   - banner.mp4         MiniMax Hailuo-02 brings it to life
//   - social-preview.png GPT Image 2.5 Sunburst, lettered — GitHub's link-preview card
// Run with: node scripts/generate-readme-banner.mjs [outDir]
// Reads FAL_KEY from .env.local, and never logs it. The GIF the README shows
// is cut from banner.mp4 with the title laid over it (docs/media/README.md).
import fs from "node:fs";
import path from "node:path";

const envText = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) {
  console.error("FAL_KEY not found in .env.local");
  process.exit(1);
}

const OUT = path.resolve(process.argv[2] ?? "recordings/readme-banner");
fs.mkdirSync(OUT, { recursive: true });
const auth = { Authorization: `Key ${FAL_KEY}` };

/** Submits to fal's queue and waits for the result. */
async function falQueue(model, input, label) {
  console.log(`→ ${label} (${model})…`);
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`${label}: submit failed ${submit.status} ${await submit.text()}`);
  const job = await submit.json();
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await (await fetch(job.status_url, { headers: auth })).json();
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "ERROR") throw new Error(`${label}: ${JSON.stringify(status)}`);
    if (i % 8 === 0) console.log(`  …${status.status}`);
  }
  const result = await fetch(job.response_url, { headers: auth });
  if (!result.ok) throw new Error(`${label}: result ${result.status} ${await result.text()}`);
  return result.json();
}

async function save(url, name) {
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  const file = path.join(OUT, name);
  fs.writeFileSync(file, bytes);
  console.log(`  saved ${file}`);
  return bytes;
}

const STYLE =
  "Beautiful anime key visual: painterly studio-anime background art, cinematic skies, " +
  "luminous soft light, rich but gentle colour, dreamlike.";

// The whole idea in one picture: words spoken aloud become light, and the sky
// turns from golden hour to night. Open sky on the left for the title.
const BANNER = await falQueue(
  "openai/gpt-image-2.5/sunburst/text-to-image",
  {
    prompt:
      `${STYLE} A girl with shoulder-length chestnut hair in a soft cream cardigan stands small on a grassy hill ` +
      "on the right side of the frame, beside blossoming cherry trees, seen from the side, speaking softly into the air. " +
      "Ribbons of glowing golden light rise from her words, curl upward and scatter into stars. The sky sweeps from warm " +
      "golden hour near the horizon into a deep indigo night full of stars overhead, cherry blossom petals drifting on the " +
      "wind. The left half of the frame is open sky and soft light, with nothing in it. Wide cinematic shot. " +
      "No text, no letters, no signature, no watermark.",
    image_size: { width: 2048, height: 1152 },
    quality: "max",
    output_format: "png",
  },
  "painting the banner",
);
const banner = await save(BANNER.images[0].url, "banner-still.png");

// Gentle motion only: this loops at the top of a README, it should breathe,
// not fly.
const MOTION = await falQueue(
  "fal-ai/minimax/hailuo-02/standard/image-to-video",
  {
    prompt:
      "Static camera, no zoom, no camera movement. Subtle, gentle motion only: the ribbons of golden light shimmer and " +
      "drift slowly upward, stars twinkle, a few cherry blossom petals float down, the girl's hair and cardigan stir " +
      "softly in the breeze. She stays where she is. Calm and dreamy.",
    image_url: `data:image/png;base64,${banner.toString("base64")}`,
    duration: "6",
    prompt_optimizer: false,
  },
  "animating it",
);
await save(MOTION.video.url, "banner.mp4");

// The card shown when the repository link is shared. GPT Image letters it.
const SOCIAL = await falQueue(
  "openai/gpt-image-2.5/sunburst/text-to-image",
  {
    prompt:
      `${STYLE} A wide banner. On the right, a girl in a soft cream cardigan stands on a grassy hill under blossoming ` +
      "cherry trees; ribbons of glowing golden light rise from her words into a sky that turns from golden hour into a " +
      "starry indigo night. On the left, over open sky, elegant lettering: the title \"Yume 夢\" in a refined serif with " +
      "the kanji 夢 beside it, and beneath it in a clean sans-serif the line \"Say it in Japanese. The world changes.\" " +
      "and, smaller, \"A language game on a live AI video world\". White and soft-gold text with a gentle glow, perfectly " +
      "spelled, nothing else written anywhere. No signature, no watermark.",
    image_size: { width: 1280, height: 640 },
    quality: "max",
    output_format: "png",
  },
  "lettering the social card",
);
await save(SOCIAL.images[0].url, "social-preview.png");
