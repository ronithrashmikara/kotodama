// Yume works both ways: English speakers learn Japanese, and Japanese speakers
// learn English. Whichever language is being learned is the one the world
// listens for, the one the narrator and Hina speak, and the one a spell's words
// fly up in; the other is the helper language every meaning is given in.
//
// The data shapes were named when Yume only taught Japanese, and they are kept:
// `kana` / `japanese` / `sentenceKana` hold the words in the language being
// learned, and `english` / `sentenceEn` / `replyEn` hold their meaning in the
// helper language. In English mode, `kana` is an English word and `english` is
// its Japanese meaning.

export type Learn = "ja" | "en";

export type LearnConfig = {
  /** The language being learned, and the helper language meanings come in. */
  target: string;
  helper: string;
  /** Speech recognition locale for the player's voice. */
  speech: string;
  /** `lang` attributes for text in each language. */
  targetTag: string;
  helperTag: string;
};

export const LEARN: Record<Learn, LearnConfig> = {
  ja: { target: "Japanese", helper: "English", speech: "ja-JP", targetTag: "ja", helperTag: "en" },
  en: { target: "English", helper: "Japanese", speech: "en-US", targetTag: "en", helperTag: "ja" },
};

export function asLearn(value: unknown): Learn {
  return value === "en" ? "en" : "ja";
}

const LEARN_KEY = "yume.learn.v1";

export function loadLearn(): Learn {
  try {
    return asLearn(localStorage.getItem(LEARN_KEY));
  } catch {
    return "ja";
  }
}

/** Whether a language was ever chosen here, so a first visit shows no "last time". */
export function hasLearnChoice(): boolean {
  try {
    return localStorage.getItem(LEARN_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveLearn(learn: Learn) {
  try {
    localStorage.setItem(LEARN_KEY, learn);
  } catch {
    // Storage being unavailable must never break the game.
  }
}
