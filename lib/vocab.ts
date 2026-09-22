// Saved vocabulary, kept in localStorage. Deliberately per-browser: it needs
// no account, no database, and no network, which keeps the demo self-contained.
// Every access is guarded because storage throws in private windows and when
// site data is blocked.

const STORAGE_KEY = "yume.vocab.v1";

export type VocabEntry = {
  surface: string;
  reading: string;
  meaning: string;
  savedAt: number;
  /** Leitner box, 1-5. Higher box = seen correctly more often = shown less. */
  box?: number;
  /** When this word next becomes due for review. */
  dueAt?: number;
  reviews?: number;
  lapses?: number;
};

// A Leitner ladder: get it right and the word moves up a box and waits longer
// before coming back; get it wrong and it drops to box 1 and returns tomorrow.
// Chosen over a full SM-2 implementation because it needs no ease factors or
// grading scale — one right/wrong answer is enough, which suits a game.
const BOX_INTERVALS_DAYS = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;

export function boxInterval(box: number): number {
  return BOX_INTERVALS_DAYS[Math.min(Math.max(box, 1), 5)] * DAY;
}

/** Words due now, oldest due first. New words (no box yet) are due immediately. */
export function dueEntries(entries: VocabEntry[], now = Date.now()): VocabEntry[] {
  return entries
    .filter((e) => (e.dueAt ?? 0) <= now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

export function reviewWord(surface: string, correct: boolean): VocabEntry[] {
  const now = Date.now();
  const next = loadVocab().map((e) => {
    if (e.surface !== surface) return e;
    const box = correct ? Math.min((e.box ?? 1) + 1, 5) : 1;
    return {
      ...e,
      box,
      dueAt: now + boxInterval(box),
      reviews: (e.reviews ?? 0) + 1,
      lapses: (e.lapses ?? 0) + (correct ? 0 : 1),
    };
  });
  persist(next);
  return next;
}

export function loadVocab(): VocabEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VocabEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: VocabEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage being unavailable must never break the game loop.
  }
}

/** Adds a word, or moves an existing one to the top. Returns the new list. */
export function saveWord(entry: Omit<VocabEntry, "savedAt">): VocabEntry[] {
  const existing = loadVocab().filter((e) => e.surface !== entry.surface);
  const next = [{ ...entry, savedAt: Date.now() }, ...existing];
  persist(next);
  return next;
}

export function removeWord(surface: string): VocabEntry[] {
  const next = loadVocab().filter((e) => e.surface !== surface);
  persist(next);
  return next;
}

export function clearVocab(): VocabEntry[] {
  persist([]);
  return [];
}
