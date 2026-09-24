import { NextResponse } from "next/server";

import { asLearn, type Learn } from "@/lib/learn";
import { getLevel, rungBrief } from "@/lib/levels";
import { chatJson, hasModel } from "@/lib/llm";
import { localCheck, type ScenarioStep } from "@/lib/scenarios";

export const runtime = "nodejs";

type CheckRequest = {
  learnerText: string;
  objectiveEn?: string;
  /** In the language being learned. */
  sampleAnswer?: string;
  requiredAll?: string[];
  freeform?: boolean;
  sceneContext?: string;
  level?: number;
  learn?: Learn;
};

type CheckResult = {
  correct: boolean;
  /** In the helper language: English, or Japanese for someone learning English. */
  feedback: string;
  /** The right way to say it, in the language being learned (English in English mode). */
  correctedJapanese: string;
  sceneAddEn?: string;
  /** What the learner actually said, in the helper language. */
  meaning?: string;
};

// Grading someone learning English: the same kindness, with feedback and the
// meaning of what they said in simple Japanese a child can read.
const SYSTEM_INSTRUCTION_EN = `You are a friendly, encouraging English tutor for a young Japanese-speaking
child, grading one short English sentence inside a game. The child is trying
to describe a specific change to a living world in English; if their sentence
is understandable and conveys the target meaning (even with small grammar
mistakes, a missing "the", or a wrong verb ending), mark it correct — this is
about being understood, not perfect grammar. Only mark it incorrect if the
core meaning is wrong, missing, or it is not English at all.

Respond ONLY with compact JSON matching this exact shape, no markdown fences:
{"correct": boolean, "feedback": "one short, playful, warm sentence in simple Japanese (mostly kana) that would make a child smile, at most one emoji", "correctedJapanese": "a natural, correct English sentence conveying the target meaning", "meaning": "what the child's own English means, in simple Japanese kana: translate what they actually said"}`;

const FREEFORM_SYSTEM_INSTRUCTION_EN = `You are a friendly, encouraging English tutor for a young Japanese-speaking
child inside an open-ended game: the child freely describes ANY change they
want to make to a living, AI-generated world, in English — there is no fixed
target sentence. Mark it correct if it is understandable English describing
some concrete visual change or addition to the scene (even with small grammar
mistakes) — this is about being understood, not perfect grammar. Mark it
incorrect only if it is not English, or does not describe anything concrete
enough to visualize.

When correct, also produce a short vivid English phrase describing the visual
change to append to an image/video generation prompt (e.g. "a red dragon
flying low over the rooftops, embers trailing from its wings").

Respond ONLY with compact JSON matching this exact shape, no markdown fences:
{"correct": boolean, "feedback": "one short, playful, warm sentence in simple Japanese (mostly kana) that would make a child smile, at most one emoji", "correctedJapanese": "a natural, correct English sentence conveying the child's intent", "sceneAddEn": "a short vivid English phrase describing the visual addition, empty string if not correct", "meaning": "what the child's own English means, in simple Japanese kana: translate what they actually said"}`;

const SYSTEM_INSTRUCTION = `You are a friendly, encouraging Japanese language tutor grading one short
learner sentence inside a game. The learner is trying to describe a specific
change to a living world in Japanese; if their sentence is understandable and
conveys the target meaning (even with small grammar mistakes, missing
particles, or an unpolished style), mark it correct — this is about
comprehensible output, not perfect grammar. Only mark it incorrect if the
core meaning is wrong, missing, or the sentence is not Japanese at all.

Respond ONLY with compact JSON matching this exact shape, no markdown fences:
{"correct": boolean, "feedback": "one short, playful, warm sentence in English that would make a child smile, max 14 words, at most one emoji", "correctedJapanese": "a natural, correct Japanese sentence conveying the target meaning", "meaning": "what the learner's own Japanese means, as natural English: translate what they actually said"}`;

const FREEFORM_SYSTEM_INSTRUCTION = `You are a friendly, encouraging Japanese language tutor inside an
open-ended game: the learner freely describes ANY change they want to make to
a living, AI-generated world, in Japanese — there is no fixed target sentence.
Mark it correct if it is understandable Japanese describing some concrete
visual change or addition to the scene (even with small grammar mistakes,
missing particles, or an unpolished style) — this is about comprehensible
output, not perfect grammar. Mark it incorrect only if it is not real
Japanese, or does not describe anything concrete enough to visualize.

When correct, also produce a short vivid English phrase describing the visual
change to append to an image/video generation prompt (e.g. "a red dragon
flying low over the rooftops, embers trailing from its wings").

Respond ONLY with compact JSON matching this exact shape, no markdown fences:
{"correct": boolean, "feedback": "one short, playful, warm sentence in English that would make a child smile, max 14 words, at most one emoji", "correctedJapanese": "a natural, correct Japanese sentence conveying the learner's intent", "sceneAddEn": "a short vivid English phrase describing the visual addition, empty string if not correct", "meaning": "what the learner's own Japanese means, as natural English: translate what they actually said"}`;

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = (await request.json()) as CheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { learnerText, objectiveEn, sampleAnswer, requiredAll, freeform, sceneContext } = body;
  const level = body.level ?? 1;
  const learn = asLearn(body.learn);
  if (!learnerText?.trim()) {
    return NextResponse.json({ error: "learnerText is required" }, { status: 400 });
  }

  const modelReady = hasModel();

  if (freeform) {
    if (!modelReady) {
      return NextResponse.json({
        correct: false,
        feedback: "Free-form worlds need a model provider configured on the server.",
        correctedJapanese: "",
        sceneAddEn: "",
        method: "unavailable",
      });
    }
    try {
      const result = await checkFreeformAnswer(learnerText, sceneContext ?? "", level, learn);
      return NextResponse.json({ ...result, method: "model" });
    } catch (caught) {
      console.error("Freeform grading failed", caught);
      return NextResponse.json({
        correct: false,
        feedback: "Something went wrong grading that — try rephrasing your sentence.",
        correctedJapanese: "",
        sceneAddEn: "",
        method: "error",
      });
    }
  }

  if (!objectiveEn || !sampleAnswer) {
    return NextResponse.json(
      { error: "objectiveEn and sampleAnswer are required outside freeform mode" },
      { status: 400 },
    );
  }

  if (modelReady) {
    try {
      const result = await checkFixedAnswer({ learnerText, objectiveEn, sampleAnswer, level, learn });
      return NextResponse.json({ ...result, method: "model" });
    } catch (caught) {
      console.error("Grading failed, falling back to offline check", caught);
    }
  }

  const fallback = localCheck({ requiredAll: requiredAll ?? [] } as ScenarioStep, learnerText);
  const result: CheckResult = {
    correct: fallback.correct,
    feedback: fallback.correct
      ? "The world understood you!"
      : `Try including: ${fallback.missing.join("、") || "the key word for this objective"}.`,
    correctedJapanese: sampleAnswer,
  };
  return NextResponse.json({ ...result, method: "offline" });
}

async function checkFixedAnswer({
  learnerText,
  objectiveEn,
  sampleAnswer,
  level,
  learn,
}: {
  learnerText: string;
  objectiveEn: string;
  sampleAnswer: string;
  level: number;
  learn: Learn;
}): Promise<CheckResult> {
  const { answerBrief } = rungBrief(getLevel(level), learn);
  const parsed = await chatJson<CheckResult>({
    system: learn === "en" ? SYSTEM_INSTRUCTION_EN : SYSTEM_INSTRUCTION,
    user: `What counts as a correct answer at this learner's level: ${answerBrief}

Target objective (English): ${objectiveEn}
One example of a fuller correct answer: ${sampleAnswer}
Learner's ${learn === "en" ? "English" : "Japanese"} answer: ${learnerText.trim()}`,
    temperature: 0.2,
    maxTokens: 400,
  });
  if (typeof parsed.correct !== "boolean") {
    throw new Error("Grader response missing 'correct' boolean");
  }
  return {
    correct: parsed.correct,
    feedback: parsed.feedback || (parsed.correct ? "Good job!" : "Not quite — try again."),
    correctedJapanese: parsed.correctedJapanese || sampleAnswer,
    meaning: parsed.meaning || undefined,
  };
}

async function checkFreeformAnswer(
  learnerText: string,
  sceneContext: string,
  level: number,
  learn: Learn,
): Promise<CheckResult> {
  const { answerBrief } = rungBrief(getLevel(level), learn);
  const parsed = await chatJson<CheckResult>({
    system: learn === "en" ? FREEFORM_SYSTEM_INSTRUCTION_EN : FREEFORM_SYSTEM_INSTRUCTION,
    user: `What counts as a correct answer at this learner's level: ${answerBrief}

The scene so far: ${sceneContext || "(an empty world, nothing described yet)"}
Learner's ${learn === "en" ? "English" : "Japanese"} describing what they want to happen next: ${learnerText.trim()}`,
    temperature: 0.4,
    maxTokens: 450,
  });
  if (typeof parsed.correct !== "boolean") {
    throw new Error("Grader response missing 'correct' boolean");
  }
  return {
    correct: parsed.correct,
    feedback: parsed.feedback || (parsed.correct ? "Good job!" : "Not quite — try again."),
    correctedJapanese: parsed.correctedJapanese || "",
    sceneAddEn: parsed.correct ? parsed.sceneAddEn || "" : "",
    meaning: parsed.meaning || undefined,
  };
}
