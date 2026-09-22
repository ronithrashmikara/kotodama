import { NextResponse } from "next/server";

import { getLevel } from "@/lib/levels";
import { chatJson } from "@/lib/openrouter";
import { localCheck, type ScenarioStep } from "@/lib/scenarios";

export const runtime = "nodejs";

type CheckRequest = {
  learnerText: string;
  objectiveEn?: string;
  sampleAnswer?: string;
  requiredAll?: string[];
  freeform?: boolean;
  sceneContext?: string;
  level?: number;
};

type CheckResult = {
  correct: boolean;
  feedback: string;
  correctedJapanese: string;
  sceneAddEn?: string;
};

const SYSTEM_INSTRUCTION = `You are a friendly, encouraging Japanese language tutor grading one short
learner sentence inside a game. The learner is trying to describe a specific
change to a living world in Japanese; if their sentence is understandable and
conveys the target meaning (even with small grammar mistakes, missing
particles, or an unpolished style), mark it correct — this is about
comprehensible output, not perfect grammar. Only mark it incorrect if the
core meaning is wrong, missing, or the sentence is not Japanese at all.

Respond ONLY with compact JSON matching this exact shape, no markdown fences:
{"correct": boolean, "feedback": "one short encouraging sentence in English, max 20 words", "correctedJapanese": "a natural, correct Japanese sentence conveying the target meaning"}`;

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
{"correct": boolean, "feedback": "one short encouraging sentence in English, max 20 words", "correctedJapanese": "a natural, correct Japanese sentence conveying the learner's intent", "sceneAddEn": "a short vivid English phrase describing the visual addition, empty string if not correct"}`;

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = (await request.json()) as CheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { learnerText, objectiveEn, sampleAnswer, requiredAll, freeform, sceneContext } = body;
  const level = body.level ?? 1;
  if (!learnerText?.trim()) {
    return NextResponse.json({ error: "learnerText is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (freeform) {
    if (!apiKey) {
      return NextResponse.json({
        correct: false,
        feedback: "Free-form worlds need an OpenRouter API key configured on the server.",
        correctedJapanese: "",
        sceneAddEn: "",
        method: "unavailable",
      });
    }
    try {
      const result = await checkFreeformAnswer(apiKey, learnerText, sceneContext ?? "", level);
      return NextResponse.json({ ...result, method: "sonnet-5" });
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

  if (apiKey) {
    try {
      const result = await checkFixedAnswer(apiKey, { learnerText, objectiveEn, sampleAnswer, level });
      return NextResponse.json({ ...result, method: "sonnet-5" });
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

async function checkFixedAnswer(
  apiKey: string,
  {
    learnerText,
    objectiveEn,
    sampleAnswer,
    level,
  }: { learnerText: string; objectiveEn: string; sampleAnswer: string; level: number },
): Promise<CheckResult> {
  const { answerBrief } = getLevel(level);
  const parsed = await chatJson<CheckResult>({
    apiKey,
    system: SYSTEM_INSTRUCTION,
    user: `What counts as a correct answer at this learner's level: ${answerBrief}

Target objective (English): ${objectiveEn}
One example of a fuller correct answer: ${sampleAnswer}
Learner's Japanese answer: ${learnerText.trim()}`,
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
  };
}

async function checkFreeformAnswer(
  apiKey: string,
  learnerText: string,
  sceneContext: string,
  level: number,
): Promise<CheckResult> {
  const { answerBrief } = getLevel(level);
  const parsed = await chatJson<CheckResult>({
    apiKey,
    system: FREEFORM_SYSTEM_INSTRUCTION,
    user: `What counts as a correct answer at this learner's level: ${answerBrief}

The scene so far: ${sceneContext || "(an empty world, nothing described yet)"}
Learner's Japanese describing what they want to happen next: ${learnerText.trim()}`,
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
  };
}
