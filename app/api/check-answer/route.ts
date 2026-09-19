import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { localCheck, type ScenarioStep } from "@/lib/scenarios";

export const runtime = "nodejs";

type CheckRequest = {
  learnerText: string;
  objectiveEn: string;
  sampleAnswer: string;
  requiredAll: string[];
};

type CheckResult = {
  correct: boolean;
  feedback: string;
  correctedJapanese: string;
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

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = (await request.json()) as CheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { learnerText, objectiveEn, sampleAnswer, requiredAll } = body;
  if (!learnerText?.trim() || !objectiveEn || !sampleAnswer) {
    return NextResponse.json(
      { error: "learnerText, objectiveEn and sampleAnswer are required" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const result = await checkWithGemini(apiKey, body);
      return NextResponse.json({ ...result, method: "gemini" });
    } catch (caught) {
      console.error("Gemini answer check failed, falling back to offline check", caught);
    }
  }

  const fallback = localCheck(
    { requiredAll } as ScenarioStep,
    learnerText,
  );
  const result: CheckResult = {
    correct: fallback.correct,
    feedback: fallback.correct
      ? "The world understood you!"
      : `Try including: ${fallback.missing.join("、") || "the key word for this objective"}.`,
    correctedJapanese: sampleAnswer,
  };
  return NextResponse.json({ ...result, method: "offline" });
}

async function checkWithGemini(
  apiKey: string,
  { learnerText, objectiveEn, sampleAnswer }: CheckRequest,
): Promise<CheckResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        text: `Target objective (English): ${objectiveEn}
One example of a correct answer: ${sampleAnswer}
Learner's Japanese sentence: ${learnerText.trim()}`,
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = response.text?.trim() || "";
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as CheckResult;
  if (typeof parsed.correct !== "boolean") {
    throw new Error("Gemini response missing 'correct' boolean");
  }
  return {
    correct: parsed.correct,
    feedback: parsed.feedback || (parsed.correct ? "Good job!" : "Not quite — try again."),
    correctedJapanese: parsed.correctedJapanese || sampleAnswer,
  };
}
