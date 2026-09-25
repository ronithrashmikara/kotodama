import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";
import { toRomaji } from "@/lib/romaji";
import { STICKERS } from "@/lib/sticker-set";

export const runtime = "nodejs";

// The lowest rung: three magic words, each ONE word with its sticker, and each
// already knowing what it will do to this scene. Say one and it happens. The
// words come from the sticker book, so the picture on the card is the sticker
// you earn for saying it.

type WordsRequest = { scene: string; learn?: Learn; recent?: string[] };

export type MagicWord = {
  /** The sticker's id; also what the card shows. */
  id: string;
  /** The word to say: kana, or the English word when learning English. */
  word: string;
  /** How it sounds: romaji, or katakana when learning English. */
  reading: string;
  /** Its meaning in the helper language. */
  meaning: string;
  /** Other spellings that count as saying it — above all the kanji. */
  accept: string[];
  /** What the camera sees happen when it is said. */
  changeEn: string;
};

// Single words only (no すなの おしろ), and only things big enough to see
// change the picture: a key or a school bell barely registers in the stream.
const TOO_SMALL = new Set(["key", "bell", "book", "medal", "teacher", "student", "city"]);
const pool = (learn: Learn) =>
  STICKERS.filter((s) => !/\s/.test(learn === "en" ? s.en : s.ja) && !TOO_SMALL.has(s.id));

// The recogniser writes Japanese in kanji (鯨, not くじら), so each word's
// everyday kanji counts as saying it. Fixed here rather than left to the model,
// which forgets them about half the time.
const KANJI: Record<string, string[]> = {
  night: ["夜"], fireworks: ["花火"], rainbow: ["虹"], moon: ["月"], stars: ["星"], sun: ["太陽", "日"],
  sunrise: ["朝日"], cloud: ["雲"], rain: ["雨"], snow: ["雪"], wind: ["風"], whale: ["鯨"], dolphin: ["海豚"],
  fish: ["魚"], turtle: ["亀"], seal: ["海豹"], crab: ["蟹"], frog: ["蛙"], boat: ["船", "舟"], lighthouse: ["灯台"],
  island: ["島"], cat: ["猫"], dog: ["犬"], rabbit: ["兎"], bird: ["鳥"], owl: ["梟"], butterfly: ["蝶"],
  firefly: ["蛍"], dinosaur: ["恐竜"], flower: ["花"], "cherry-blossom": ["桜"], tree: ["木"], mountain: ["山"],
  lake: ["湖"], house: ["家"], lantern: ["提灯"], treasure: ["宝箱"], balloon: ["風船"], kite: ["凧"], train: ["電車"],
};

// Katakana to hiragana, to spot a "reading" that is only the Japanese word again.
const hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const SYSTEM = `You pick THREE magic words for a very young beginner in a language game. The
player sees a live, generated video world and says ONE word; that thing then
appears or happens in the world.

Pick from the candidate list only (use the exact id). The three must:
- each make a BIG, clearly visible, delightful change in THIS scene: an animal
  appearing, night falling, fireworks, a rainbow. Nothing tiny.
- fit the place (a whale needs water; the sea is fine for a boat, a park for a cat)
- be different kinds of thing (not three animals) and not in the recent list

For each, write "changeEn": ONE English sentence, what the camera sees happen,
starting from the current scene. Physical nouns and verbs, stated positively,
big and visible. e.g. "A huge whale leaps out of the sea, splashing sparkling water."
And "accept": the word's other everyday spellings with the SAME reading, above
all its kanji (くじら → ["鯨"], よる → ["夜"], はなび → ["花火"]); [] if none.

Respond ONLY with compact JSON, no markdown fences:
{"words":[{"id":"...","accept":["..."],"changeEn":"..."},{"id":"...","accept":[],"changeEn":"..."},{"id":"...","accept":[],"changeEn":"..."}]}`;

// For someone learning English the word is English, and they need to hear how it sounds.
const READING_EN = `Also give "reading": the SOUND of the English word written in katakana, for a Japanese child (whale → ホエール, night → ナイト, rain → レイン). Never the Japanese word for it (rain is レイン, not アメ).`;

export async function POST(request: Request) {
  let body: WordsRequest;
  try {
    body = (await request.json()) as WordsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });
  if (!hasModel()) return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });

  const learn = asLearn(body.learn);
  const recent = new Set(body.recent ?? []);
  const candidates = pool(learn).filter((s) => !recent.has(s.id));

  try {
    const reply = await chatJson<{ words?: { id?: string; accept?: unknown; changeEn?: string; reading?: string }[] }>({
      system: learn === "en" ? `${SYSTEM}\n${READING_EN}` : SYSTEM,
      user: `The scene right now: ${scene}

Recent words (pick others): ${recent.size ? [...recent].join(", ") : "(none yet)"}

Candidates (id: japanese / english):
${candidates.map((s) => `${s.id}: ${s.ja} / ${s.en}`).join("\n")}`,
      temperature: 0.8,
      maxTokens: 500,
    });

    const seen = new Set<string>();
    const words: MagicWord[] = [];
    for (const draft of reply.words ?? []) {
      // Asked for the id, a model often answers with the word itself (いるか
      // for dolphin), so any of the three names finds the sticker.
      const key = draft.id?.trim().toLowerCase();
      const sticker = candidates.find((s) => s.id === key || s.ja === key || s.en.toLowerCase() === key);
      if (!sticker || seen.has(sticker.id) || !draft.changeEn?.trim()) continue;
      seen.add(sticker.id);
      const accept = Array.isArray(draft.accept) ? draft.accept.filter((a): a is string => typeof a === "string") : [];
      words.push(
        learn === "en"
          ? {
              id: sticker.id,
              word: sticker.en,
              reading: draft.reading?.trim() && hira(draft.reading.trim()) !== sticker.ja ? draft.reading.trim() : "",
              meaning: sticker.ja,
              accept: [],
              changeEn: draft.changeEn.trim(),
            }
          : {
              id: sticker.id,
              word: sticker.ja,
              reading: toRomaji(sticker.ja),
              meaning: sticker.en,
              accept: [...new Set([...(KANJI[sticker.id] ?? []), ...accept])],
              changeEn: draft.changeEn.trim(),
            },
      );
    }
    if (words.length < 2) throw new Error(`only ${words.length} usable words`);
    return NextResponse.json({ words: words.slice(0, 3) });
  } catch (caught) {
    console.error("Words failed", caught);
    return NextResponse.json({ error: "Could not pick words" }, { status: 502 });
  }
}
