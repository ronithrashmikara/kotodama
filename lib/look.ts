import type { Learn } from "@/lib/learn";

// Looking around the world by saying where to look: ひだり, みぎ, うしろ. Three
// of the first words anyone learns, and each one turns the camera.
//
// Measured live (camera-probe, 25 Sep 2026): Orbis follows turning — "turn
// left" and "turn all the way around" swung the view onto a new part of the
// park within 5-12 seconds. Tilting up or down, zooming and flying overhead
// barely moved it, so those are not offered.

export type LookWord = {
  id: "left" | "right" | "behind";
  /** The word as shown: kana, or the English word when learning English. */
  word: string;
  /** How it sounds: romaji, or katakana for someone learning English. */
  reading: string;
  /** Its meaning in the helper language. */
  meaning: string;
  arrow: string;
  /** The Orbis steer, in the wording that turned the camera in the probe. */
  prompt: string;
};

const PROMPTS = {
  left: "The camera slowly turns to the left.",
  right: "The camera slowly turns to the right.",
  behind: "Turning all the way around to look behind.",
} as const;

export const LOOK_WORDS: Record<Learn, LookWord[]> = {
  ja: [
    { id: "left", word: "ひだり", reading: "hidari", meaning: "left", arrow: "←", prompt: PROMPTS.left },
    { id: "behind", word: "うしろ", reading: "ushiro", meaning: "behind", arrow: "↻", prompt: PROMPTS.behind },
    { id: "right", word: "みぎ", reading: "migi", meaning: "right", arrow: "→", prompt: PROMPTS.right },
  ],
  en: [
    { id: "left", word: "left", reading: "レフト", meaning: "ひだり", arrow: "←", prompt: PROMPTS.left },
    { id: "behind", word: "behind", reading: "ビハインド", meaning: "うしろ", arrow: "↻", prompt: PROMPTS.behind },
    { id: "right", word: "right", reading: "ライト", meaning: "みぎ", arrow: "→", prompt: PROMPTS.right },
  ],
};

// Everything that counts as saying just that word. The recogniser writes
// Japanese in kanji (左, 右, 後ろ), and a child may add "look" or みて.
const SAID: Record<Learn, Record<LookWord["id"], string[]>> = {
  ja: {
    left: ["ひだり", "左", "hidari"],
    right: ["みぎ", "右", "migi"],
    behind: ["うしろ", "後ろ", "後", "ushiro"],
  },
  en: {
    left: ["left"],
    right: ["right"],
    behind: ["behind", "around", "back"],
  },
};

const tidy = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s、。,.!！?？「」"'ー~〜]/g, "")
    .replace(/^(look|turn|go)/, "")
    .replace(/(をみて|を見て|みて|見て|をむいて|を向いて|むいて|向いて|へ|に)$/, "");

/**
 * The look word, if that is ALL they said: "みぎ", "右", "みぎ みて", "look left".
 * A longer sentence that merely contains one (みぎに ねこが いる) is not a look.
 */
export function matchLook(said: string, learn: Learn): LookWord | null {
  const heard = tidy(said);
  if (!heard) return null;
  for (const look of LOOK_WORDS[learn]) {
    if (SAID[learn][look.id].some((form) => tidy(form) === heard)) return look;
  }
  return null;
}
