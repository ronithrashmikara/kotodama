import set from "@/lib/sticker-set.json";

/**
 * One sticker of the core set: drawn once, by scripts/generate-stickers.mjs,
 * from the concepts in lib/sticker-set.json. Anything outside the set is drawn
 * on the fly by app/api/sticker in the same style.
 */
export type StickerDef = {
  id: string;
  /** What it is, in English and in kana a child can read. */
  en: string;
  ja: string;
  /** English words that mean it, as they turn up in a scene description. */
  keywords: string[];
  src: string;
  /** How specific it is: a whale (3) beats a lighthouse (2) beats the moon (1) beats the night (0). */
  rank: number;
};

type Entry = { id: string; en: string; ja: string; rank: number; draw: string; keywords: string[] };

export const STICKERS: StickerDef[] = (set as Entry[]).map(({ id, en, ja, rank, keywords }) => ({
  id,
  en,
  ja,
  rank,
  keywords,
  src: `/stickers/${id}.webp`,
}));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole words only ("star" is not "starfish"), plurals allowed, and a phrase
// keyword ("shooting star") may span any spacing.
const MATCHERS = STICKERS.map((sticker) => ({
  sticker,
  patterns: sticker.keywords.map(
    (k) => new RegExp(`\\b${escape(k.toLowerCase()).replace(/\s+/g, "\\s+")}(?:s|es)?\\b`, "i"),
  ),
}));

/**
 * The core sticker for an English description of what just changed, or null.
 * The most specific thing wins ("a huge whale leaping under the moon" is the
 * whale); among equals, the one mentioned first — a description names its
 * subject before the setting.
 */
export function matchSticker(text: string): StickerDef | null {
  let best: { sticker: StickerDef; at: number; length: number } | null = null;
  for (const { sticker, patterns } of MATCHERS) {
    patterns.forEach((pattern, i) => {
      const hit = pattern.exec(text);
      if (!hit) return;
      const candidate = { sticker, at: hit.index, length: sticker.keywords[i].length };
      if (
        !best ||
        sticker.rank > best.sticker.rank ||
        (sticker.rank === best.sticker.rank &&
          (candidate.at < best.at || (candidate.at === best.at && candidate.length > best.length)))
      ) {
        best = candidate;
      }
    });
  }
  return (best as { sticker: StickerDef } | null)?.sticker ?? null;
}

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}
