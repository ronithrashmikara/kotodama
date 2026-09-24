// Kana → romaji, and a deliberately forgiving comparison used to grade the
// first rung (learn a sentence word by word, then say it whole).
//
// That grading runs entirely on the client. Repeating a taught word is a
// pronunciation attempt, not a composition, so sending it to an LLM would add a
// second of latency to the single most important moment in a beginner's
// session — the first time they speak Japanese and the world answers. That
// moment has to feel instant.

const KANA: Array<[string, string]> = [
  // Digraphs first: き + ゃ must beat き on its own.
  ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"],
  ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"],
  ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"],
  ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"],
  ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"],
  ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"],
  ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"],
  ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"],
  ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"],
  ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"],
  ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"],

  ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
  ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
  ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
  ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
  ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
  ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
  ["や", "ya"], ["ゆ", "yu"], ["よ", "yo"],
  ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
  ["わ", "wa"], ["を", "o"], ["ん", "n"],
  ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"],
  ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"],
  ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"],
  ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"],
  ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"],
  ["ー", ""], ["、", " "], ["。", " "], ["　", " "],
];

/** Katakana share codepoints with hiragana at a fixed offset of 0x60. */
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function toRomaji(input: string): string {
  let s = toHiragana(input);
  let out = "";
  let i = 0;
  while (i < s.length) {
    // っ doubles the consonant that follows it.
    if (s[i] === "っ") {
      const rest = toRomaji(s.slice(i + 1));
      out += (rest[0] ?? "") + rest;
      break;
    }
    const hit = KANA.find(([k]) => s.startsWith(k, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += s[i];
      i += 1;
    }
  }
  return out;
}

const HAS_KANA = /[぀-ヿ]/;

/**
 * Strip everything that a learner could reasonably get wrong without being
 * wrong: long vowels, doubled consonants, spacing, and the r/l confusion that
 * every English speaker starts with.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z぀-ヿ一-龯]/g, "")
    .replace(/l/g, "r")
    .replace(/([aeiou])\1+/g, "$1")
    .replace(/([bcdfghjkmnpqrstvwxyz])\1+/g, "$1")
    .replace(/ou/g, "o")
    .replace(/uu/g, "u");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const x = fold(a);
  const y = fold(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/**
 * Did the learner say the target word?
 *
 * Speech recognition runs in ja-JP, so it usually returns kana or kanji — but
 * a beginner pronouncing "neko" in an English accent often comes back as
 * romaji or as something phonetically adjacent. Both paths are compared and
 * the better score wins, because failing a beginner's first attempt on a
 * transcription artefact would be the worst possible moment to be strict.
 */
export function matchesEcho(
  said: string,
  targetKana: string,
  targetRomaji?: string,
  /**
   * Other spellings that count, above all the KANJI form. Chrome's ja-JP
   * recogniser returns 猫 when someone says "neko", never ねこ — so without
   * this a beginner pronounces the word perfectly and is told they were wrong,
   * which is the worst possible moment to be wrong about.
   */
  accept: string[] = [],
): { ok: boolean; score: number } {
  const heard = said.trim();
  if (!heard) return { ok: false, score: 0 };

  const romaji = targetRomaji?.trim() || toRomaji(targetKana);
  const scores = [
    similarity(heard, targetKana),
    similarity(heard, romaji),
    ...accept.filter(Boolean).map((alt) => similarity(heard, alt)),
  ];
  // If they spoke kana, also compare its romanisation — "ネコ" vs "ねこ".
  if (HAS_KANA.test(heard)) scores.push(similarity(toRomaji(heard), romaji));

  const score = Math.max(...scores);
  // 0.6 is generous on purpose: two-mora words are short, so one wrong sound
  // is already a third of the word.
  return { ok: score >= 0.6, score };
}

export type SpokenWord = { kana: string; romaji?: string; accept?: string[] };

/** Width-folded, katakana as hiragana, spaces and punctuation gone. */
function compact(s: string): string {
  return toHiragana(s.normalize("NFKC").toLowerCase().replace(/[\s、。，．！？!?,.・「」『』ー]/g, ""));
}

/**
 * Every shape a word can come back in from ja-JP recognition. Verbs are the
 * hard part: ふる is taught, but the recogniser may hand back 降ります — so a
 * kanji spelling also counts by its stem (降), and a kana spelling of three or
 * more by everything but its last kana (のぼる → のぼ, which still finds
 * のぼります). Loose on purpose: a beginner's sentence is not the place to be
 * strict.
 */
function spokenForms(word: SpokenWord): string[] {
  const forms = new Set<string>();
  for (const raw of [word.kana, ...(word.accept ?? [])]) {
    const form = compact(raw);
    if (!form) continue;
    forms.add(form);
    const stem = form.match(/^.*[一-龯㐀-䶿]/)?.[0];
    if (stem) forms.add(stem);
    else if (form.length >= 3) forms.add(form.slice(0, -1));
  }
  return [...forms];
}

/**
 * Did the learner say this sentence? Each taught word is looked for anywhere in
 * what was heard, in any script. Particles are ignored — dropping が is not
 * what stops a beginner being understood — and once a sentence has three words,
 * one missed word is forgiven too.
 */
export function matchesSentence(
  said: string,
  words: SpokenWord[],
): { ok: boolean; found: boolean[] } {
  const heard = compact(said);
  if (!heard || !words.length) return { ok: false, found: words.map(() => false) };

  const heardRomaji = fold(HAS_KANA.test(heard) ? toRomaji(heard) : heard);
  const found = words.map((word) => {
    if (spokenForms(word).some((form) => heard.includes(form))) return true;
    const romaji = fold(word.romaji || toRomaji(word.kana));
    return romaji.length >= 2 && heardRomaji.includes(romaji);
  });

  const hits = found.filter(Boolean).length;
  return { ok: hits === words.length || (words.length >= 3 && hits === words.length - 1), found };
}

/** One word, said on its own — or inside a longer phrase the recogniser padded it with. */
export function matchesWord(said: string, word: SpokenWord): boolean {
  return (
    matchesEcho(said, word.kana, word.romaji, word.accept).ok ||
    matchesSentence(said, [word]).ok
  );
}
