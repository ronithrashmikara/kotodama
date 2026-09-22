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
};

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
