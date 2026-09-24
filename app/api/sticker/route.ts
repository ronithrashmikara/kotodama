import { NextResponse } from "next/server";

import { chatJson, hasModel } from "@/lib/llm";
import { matchSticker, stickerById } from "@/lib/sticker-set";

export const runtime = "nodejs";

type StickerRequest = {
  /** English description of what just changed in the world. */
  text?: string;
};

export type Sticker = { id: string; en: string; ja: string; src: string; fresh: boolean };
export type StickerReply = { sticker: Sticker };

// The same look as the core set (scripts/generate-stickers.mjs), worded for
// FLUX, which draws on a plain background that BiRefNet then cuts away. GPT
// Image draws the core set better but takes ~20s; this takes ~5s.
const DRAW = (thing: string) =>
  `Glossy kawaii die-cut sticker of ${thing}, chibi, bright saturated candy colours, bold dark outline ` +
  "inside a thick white sticker border, soft cel shading, big shiny eyes, cheerful, centred and filling " +
  "most of the frame, isolated on a plain flat light grey background. No text.";

const CONCEPT = `A child just changed a magical world with their words. Given an English description
of the change, name the ONE concrete thing in it that would make the best sticker: an
animal, a creature, an object, or a weather or sky thing a child can picture. Keep any
colour or kind that makes it special ("red dragon", "paper boat"), 1 to 3 words.

Respond ONLY with compact JSON, no markdown fences:
{"en": "red dragon", "ja": "the same thing in simple kana a child can read, e.g. あかい ドラゴン"}`;

// Generated once per concept per server, however many players ask for it. A
// promise, so two players asking at the same moment also share one drawing.
const drawn = new Map<string, Promise<Sticker>>();

const fallback = (): Sticker => {
  const star = stickerById("stars")!;
  return { id: star.id, en: star.en, ja: star.ja, src: star.src, fresh: false };
};

async function fal<T>(model: string, input: Record<string, unknown>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${model} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function drawSticker(en: string, ja: string): Promise<Sticker> {
  const art = await fal<{ images: { url: string }[] }>(
    "fal-ai/flux/dev",
    { prompt: DRAW(en), image_size: "square", num_inference_steps: 20, output_format: "png" },
    15_000,
  );
  const cut = await fal<{ image: { url: string } }>(
    "fal-ai/birefnet",
    { image_url: art.images[0].url, output_format: "webp" },
    12_000,
  );
  const slug = en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { id: `fresh-${slug}`, en, ja, src: cut.image.url, fresh: true };
}

export async function POST(request: Request) {
  let body: StickerRequest;
  try {
    body = (await request.json()) as StickerRequest;
  } catch {
    return NextResponse.json({ sticker: fallback() } satisfies StickerReply);
  }

  const text = body.text?.trim() ?? "";
  // Matching the whole description finds whatever it mentions, not what it is
  // about: "a paper airplane gliding over the lake" is not a lake sticker. So
  // the subject is named first, and the core set only answers for that.
  const byKeyword = (): Sticker => {
    const core = text ? matchSticker(text) : null;
    return core ? { id: core.id, en: core.en, ja: core.ja, src: core.src, fresh: false } : fallback();
  };
  if (!text || !hasModel() || !process.env.FAL_KEY) {
    return NextResponse.json({ sticker: byKeyword() } satisfies StickerReply);
  }

  try {
    const concept = await chatJson<{ en?: string; ja?: string }>({
      system: CONCEPT,
      user: text.slice(0, 400),
      temperature: 0.3,
      maxTokens: 160,
    });
    const en = concept.en?.trim().toLowerCase().replace(/[^a-z '-]/g, "").replace(/\s+/g, " ") ?? "";
    if (!en || en.split(" ").length > 4) throw new Error(`no usable concept: ${JSON.stringify(concept)}`);

    // The model may name something the core set already has.
    const known = matchSticker(en);
    if (known) {
      return NextResponse.json({
        sticker: { id: known.id, en: known.en, ja: known.ja, src: known.src, fresh: false },
      } satisfies StickerReply);
    }

    let pending = drawn.get(en);
    if (!pending) {
      pending = drawSticker(en, concept.ja?.trim() || en);
      drawn.set(en, pending);
      // A failed drawing is not remembered: the next player tries again.
      pending.catch(() => drawn.delete(en));
    }
    return NextResponse.json({ sticker: await pending } satisfies StickerReply);
  } catch (caught) {
    console.error("Sticker failed", caught);
    return NextResponse.json({ sticker: byKeyword() } satisfies StickerReply);
  }
}
