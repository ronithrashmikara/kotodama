// Honey Bird studio mark, in torn-paper collage style.
// GPT Image 2.5 Sunburst on fal, high quality.
import fs from 'node:fs';
import path from 'node:path';

const envText = fs.readFileSync('.env.local', 'utf8');
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1); }

const MODEL = 'openai/gpt-image-2.5/sunburst/text-to-image';

const PROMPT =
  'torn paper collage illustration, cut-paper craft style with visible rough deckled paper edges ' +
  'and soft paper grain texture. A plump friendly bird made of warm coral-orange torn paper, ' +
  'seen side-on, holding a golden-yellow honeycomb piece in its beak with a small drip of honey. ' +
  'The bird has a simple childlike happy face: two closed curved smiling eyes and a small smile. ' +
  'Deep navy blue textured paper background. Scattered small golden-yellow paper dashes and a few ' +
  'small cream five-point paper stars around the bird. Flat, warm, handmade, centred composition, ' +
  'generous space around the bird. No text, no words, no watermark.';

const res = await fetch(`https://fal.run/${MODEL}`, {
  method: 'POST',
  headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: PROMPT, image_size: { width: 1024, height: 1024 }, quality: 'high', num_images: 4 }),
});
if (!res.ok) { console.error(res.status, (await res.text()).slice(0, 400)); process.exit(1); }

const images = (await res.json()).images ?? [];
const outDir = path.resolve('public/art');
for (let i = 0; i < images.length; i++) {
  const buf = Buffer.from(await (await fetch(images[i].url)).arrayBuffer());
  const out = path.join(outDir, `honeybird-paper-${i}.png`);
  fs.writeFileSync(out, buf);
  console.log(`${out}  ${(buf.length / 1024).toFixed(0)} KB`);
}
