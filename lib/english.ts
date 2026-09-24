import { similarity, type SpokenWord } from "@/lib/romaji";

// Did an English learner say the words they were taught? The en-US recogniser
// hands back whole words, capitalised and punctuated, and often a homophone of
// the right one ("knight" for night, "son" for sun); a beginner's accent adds
// near-misses. So each taught word is looked for on its own, loosely, and any
// spelling the sentence builder listed in `accept` counts too.
//
// The similarity measure is the one built for romaji, which folds l into r. For
// a Japanese speaker learning English that is a kindness, not a bug: light and
// right are the pair they are least able to hear apart yet.

function heardWords(said: string): string[] {
  return said
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

/**
 * "rises" and "rise", "shining" and "shine", "running" and "run": the ending
 * is not what is being learned here, so both sides are cut back to a stem.
 */
function stem(word: string): string {
  let w = word.replace(/'s?$/, "");
  if (w.length > 4) w = w.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "");
  w = w.replace(/e$/, "").replace(/([b-df-hj-np-tv-z])\1$/, "$1");
  return w || word;
}

function saidWord(heard: string[], word: SpokenWord): boolean {
  const joined = ` ${heard.join(" ")} `;
  for (const target of [word.kana, ...(word.accept ?? [])]) {
    const parts = heardWords(target);
    if (!parts.length) continue;
    // A phrase ("cherry blossom") has to be there as a phrase.
    if (parts.length > 1) {
      if (joined.includes(` ${parts.join(" ")} `)) return true;
      continue;
    }
    const want = stem(parts[0]);
    for (const got of heard) {
      const have = stem(got);
      if (have === want) return true;
      // A short word is one sound: "light" is not "night", however close the
      // letters. Only long words get a near miss; homophones come via accept.
      if (want.length >= 6 && similarity(have, want) > 0.8) return true;
    }
  }
  return false;
}

/** One taught word, said on its own or inside whatever the recogniser padded it with. */
export function matchesWordEn(said: string, word: SpokenWord): boolean {
  return saidWord(heardWords(said), word);
}

/**
 * The whole sentence. Small words (the, a) are ignored, as particles are in
 * Japanese, and once a sentence has three words one missed word is forgiven.
 */
export function matchesSentenceEn(said: string, words: SpokenWord[]): { ok: boolean; found: boolean[] } {
  const heard = heardWords(said);
  if (!heard.length || !words.length) return { ok: false, found: words.map(() => false) };
  const found = words.map((word) => saidWord(heard, word));
  const hits = found.filter(Boolean).length;
  return { ok: hits === words.length || (words.length >= 3 && hits === words.length - 1), found };
}
