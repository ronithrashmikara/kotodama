import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { chatJson, hasModel } from "@/lib/llm";
import {
  ONE_WORD_RULES,
  partsProblem,
  SENTENCE_RULES,
  shapeSentence,
  type DraftPart,
  type TaughtSentence,
} from "@/lib/sentence-shape";

export const runtime = "nodejs";

type QuestRequest = {
  scene: string;
  learn?: Learn;
  /** Quests already done this dream, so the next one is different. */
  recent?: string[];
  /** The lowest rung: the quest is solved by saying one word. */
  oneWord?: boolean;
};

/**
 * A little problem the world develops, which the player's words can solve: a
 * lost turtle, a kite caught in a tree, a lantern gone out. It comes with the
 * short sentence that solves it, taught a word at a time like the beginner
 * sentences, so even a first-time player can finish a quest.
 */
export type Quest = TaughtSentence & {
  /** In the helper language: the quest's name, and what is wrong and what to say. */
  title: string;
  ask: string;
  /** English, for Orbis: the problem appearing, then the happy ending. */
  problemEn: string;
  solvedEn: string;
  /** English: what the reward sticker shows. */
  sticker: string;
};

type Draft = {
  title?: string;
  ask?: string;
  problemEn?: string;
  solvedEn?: string;
  sticker?: string;
  parts?: DraftPart[];
  sentenceEn?: string;
  meaning?: string;
};

const QUEST_RULES = `Rules for the quest:
- Gentle and cute, never scary, sad or dangerous: an animal that is lost, stuck, sleepy or hungry, a kite caught in a tree, a lantern that went out, a flower that needs water, a friend who is shy.
- It must fit the scene, and the camera must be able to SHOW both the problem and the happy ending clearly: something big and visible (an animal, a boat, a kite, a lantern), not a tiny detail.
- The child's sentence is EXACTLY what the "ask" tells them to say, and saying it is what makes the happy ending happen: a call, a kind word, a wish or a simple instruction. ("Tell the cat to wake up" → a sentence that says wake up, not one that says the cat is sleepy.)
- "problemEn": ONE short English sentence, the problem appearing as the camera sees it, for a video model.
- "solvedEn": ONE short English sentence, the happy ending as the camera sees it.
- "sticker": the main thing in the quest, 1-2 English words ("turtle", "red kite").
- Different from the quests already done.`;

const SYSTEM: Record<Learn, string> = {
  ja: `You invent ONE tiny quest in a living, dreamlike video world, for a young child learning Japanese whose own language is English. Something gentle goes a little wrong in the scene, and the child fixes it by SAYING one short Japanese sentence.

${QUEST_RULES}
- "title": a fun quest name in simple English, at most 5 words. "ask": ONE simple English sentence telling the child what is wrong and what to say ("The little turtle is lost! Tell it where the sea is.").

Rules for the sentence the child says:
${SENTENCE_RULES.ja}
- "sentenceEn": the whole sentence in English.

Respond ONLY with compact JSON, no markdown fences:
{"title":"...","ask":"...","problemEn":"...","solvedEn":"...","sticker":"...","parts":[{"kind":"word","kana":"うみ","english":"sea","accept":["海"]},{"kind":"particle","kana":"は"},{"kind":"word","kana":"あっち","english":"over there","accept":[]}],"sentenceEn":"The sea is over there."}`,
  en: `You invent ONE tiny quest in a living, dreamlike video world, for a young Japanese-speaking child learning English. Something gentle goes a little wrong in the scene, and the child fixes it by SAYING one short English sentence.

${QUEST_RULES}
- "title": a fun quest name in simple Japanese kana, at most 12 characters. "ask": ONE simple Japanese sentence, mostly kana, telling the child what is wrong and what to say (「かめさんが まいご！うみは どっちか おしえてあげて。」).
- Every Japanese word must be correct, natural Japanese, the way a kindergarten teacher talks. Use common words, and katakana loanwords a child knows (ランタン, カイト, ボート) rather than rare or made-up ones.

Rules for the sentence the child says:
${SENTENCE_RULES.en}
- "meaning": the whole sentence in simple Japanese kana.

Respond ONLY with compact JSON, no markdown fences:
{"title":"...","ask":"...","problemEn":"...","solvedEn":"...","sticker":"...","parts":[{"kind":"word","word":"sea","meaning":"うみ","reading":"シー","accept":["see"]},{"kind":"word","word":"there","meaning":"あっち","reading":"ゼア","accept":["their"]}],"meaning":"うみは あっち"}`,
};

function problem(learn: Learn, draft: Draft, oneWord: boolean): string | null {
  for (const key of ["title", "ask", "problemEn", "solvedEn", "sticker"] as const) {
    if (!draft[key]?.trim()) return `"${key}" was missing`;
  }
  return partsProblem(learn, draft.parts, oneWord);
}

// The one-word version of each prompt: the same quest, solved by one word.
const oneWordSystem = (learn: Learn) =>
  SYSTEM[learn]
    .replace("SAYING one short Japanese sentence", "SAYING ONE Japanese word")
    .replace("SAYING one short English sentence", "SAYING ONE English word")
    .replace(SENTENCE_RULES[learn], ONE_WORD_RULES[learn])
    .replace(/\{"title".*$/s, learn === "en"
      ? '{"title":"...","ask":"...","problemEn":"...","solvedEn":"...","sticker":"...","parts":[{"kind":"word","word":"jump","meaning":"とんで","reading":"ジャンプ","accept":["jumps"]}],"meaning":"とんで"}'
      : '{"title":"...","ask":"...","problemEn":"...","solvedEn":"...","sticker":"...","parts":[{"kind":"word","kana":"とんで","english":"jump!","accept":["飛んで","跳んで"]}],"sentenceEn":"Jump!"}');

export async function POST(request: Request) {
  let body: QuestRequest;
  try {
    body = (await request.json()) as QuestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scene = body.scene?.trim();
  if (!scene) return NextResponse.json({ error: "scene is required" }, { status: 400 });
  if (!hasModel()) {
    return NextResponse.json({ error: "No model provider is configured" }, { status: 503 });
  }

  const learn = asLearn(body.learn);
  const oneWord = Boolean(body.oneWord);
  const recent = (body.recent ?? []).filter(Boolean);
  const ask = (extra = "") =>
    chatJson<Draft>({
      system: oneWord ? oneWordSystem(learn) : SYSTEM[learn],
      user:
        `The scene right now: ${scene}\n\n` +
        (recent.length ? `Quests already done: ${recent.join(" | ")}\n\n` : "") +
        `Invent the quest.${extra}`,
      temperature: 0.7,
      maxTokens: 800,
    });

  try {
    let draft = await ask();
    let reason = problem(learn, draft, oneWord);
    if (reason) {
      draft = await ask(`\n\nYour previous answer could not be used because ${reason}. Follow every rule.`);
      reason = problem(learn, draft, oneWord);
    }
    if (reason) return NextResponse.json({ error: `Could not make a quest: ${reason}` }, { status: 502 });

    const quest: Quest = {
      ...shapeSentence(learn, draft.parts ?? [], (learn === "en" ? draft.meaning : draft.sentenceEn) ?? ""),
      title: draft.title!.trim(),
      ask: draft.ask!.trim(),
      problemEn: draft.problemEn!.trim(),
      solvedEn: draft.solvedEn!.trim(),
      sticker: draft.sticker!.trim(),
    };
    return NextResponse.json(quest);
  } catch (error) {
    console.error("Quest failed", error);
    return NextResponse.json({ error: "Could not make a quest" }, { status: 502 });
  }
}
