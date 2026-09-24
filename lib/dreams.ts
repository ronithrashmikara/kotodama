import type { Learn } from "@/lib/learn";

// What the player did in earlier dreams, kept in this browser, so Hina can
// remember them: "Last time you made a whale jump!" A friend who remembers you
// is the difference between a character and a chatbot.

export type DreamMemory = {
  at: number;
  world: string;
  learn: Learn;
  /** The sentences that changed the world, with what they meant. */
  said: { text: string; meaning?: string }[];
  /** English names of the stickers earned. */
  stickers: string[];
};

const KEY = "yume.dreams.v1";

export function recentDreams(count = 3): DreamMemory[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as DreamMemory[]).slice(-count).reverse() : [];
  } catch {
    return [];
  }
}

export function rememberDream(dream: DreamMemory) {
  if (!dream.said.length && !dream.stickers.length) return;
  try {
    const all = recentDreams(20).reverse();
    localStorage.setItem(KEY, JSON.stringify([...all, dream].slice(-10)));
  } catch {
    // Forgetting is sad, but never breaks the game.
  }
}

/** Earlier dreams as a few plain-English lines Hina can draw on. */
export function describeDreams(dreams: DreamMemory[]): string[] {
  const ago = (at: number) => {
    const days = Math.floor((Date.now() - at) / 86_400_000);
    return days <= 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
  };
  return dreams.map((d) => {
    const lines = d.said
      .slice(0, 3)
      .map((s) => `"${s.text}"${s.meaning ? ` (${s.meaning})` : ""}`)
      .join(", ");
    const stickers = d.stickers.length ? `; stickers earned: ${d.stickers.slice(0, 4).join(", ")}` : "";
    return `${ago(d.at)}, in "${d.world}", they said ${lines || "a few words"}${stickers}`;
  });
}
