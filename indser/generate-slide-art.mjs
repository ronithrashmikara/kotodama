// Presentation artwork via GPT Image 2.5 Sunburst on fal (high quality).
// These are concept illustrations for the deck — never gameplay evidence.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const envText = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const FAL_KEY = process.env.FAL_KEY ?? envText.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1); }

const MODEL = 'openai/gpt-image-2.5/sunburst/text-to-image';
const STYLE = 'soft hand-drawn Japanese picture-book illustration, gentle gouache and coloured-pencil texture, ' +
  'warm muted pastel palette of cream, dusty rose, sage and pale gold, generous negative space, ' +
  'calm and dreamlike, no text, no words, no letters, no watermark, no UI';

const TARGETS = [
  { name: 'hero-dream',
    prompt: `${STYLE}. A vast dreamlike Japanese landscape seen from a quiet hilltop at golden hour — a torii gate, cherry trees, distant rooftops, soft clouds below, a single small figure standing and looking out over it, wide cinematic composition with the figure small in the frame.` },
  { name: 'living-world',
    prompt: `${STYLE}. The same quiet Japanese park shown as a gentle sequence of change across one image — petals lifting on a breeze, light shifting from afternoon to dusk, a small cat crossing the grass, rain beginning at the far right edge, a sense of time passing on its own.` },
  { name: 'companion-walk',
    prompt: `${STYLE}. Two friends walking together down a cherry-blossom path in soft evening light, seen from behind at a respectful distance, one gesturing as if mid-conversation, warm and companionable, the world opening up ahead of them.` },
];

const outDir = path.join(root, 'indser', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const provenance = [];

for (const t of TARGETS) {
  process.stdout.write(`→ ${t.name} … `);
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: t.prompt, image_size: { width: 1536, height: 1024 }, quality: 'high', num_images: 1 }),
  });
  if (!res.ok) { console.log(`FAILED ${res.status}`); console.log((await res.text()).slice(0, 400)); continue; }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) { console.log('no image url'); console.log(JSON.stringify(data).slice(0, 300)); continue; }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(outDir, `${t.name}.webp`), buf);
  provenance.push({ name: t.name, url });
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(outDir, 'provenance.json'), JSON.stringify({
  model: MODEL, provider: 'fal.ai', quality: 'high',
  purpose: 'Concept presentation artwork, not gameplay evidence',
  images: provenance,
}, null, 2));
console.log('done');
