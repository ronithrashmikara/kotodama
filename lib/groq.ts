// Shared Groq client for the two places that need a model: grading a
// learner's answer and narrating the live scene. Both sit directly in the
// live game loop — the learner is waiting for the world to react — so speed
// matters as much as quality here. GPT-OSS 120B on Groq runs at ~500
// tokens/sec, which keeps a ~400-token JSON reply well under a second.
export const GRADER_MODEL = "openai/gpt-oss-120b";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function chatJson<T>({
  apiKey,
  system,
  user,
  temperature = 0.3,
  maxTokens = 700,
}: {
  apiKey: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GRADER_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // GPT-OSS is a reasoning model — without this its chain-of-thought
      // leaks into `content` and breaks JSON-mode validation (Groq 400s with
      // an empty failed_generation). Low effort also keeps this fast, which
      // matters since both call sites sit in the live game loop.
      include_reasoning: false,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Groq returned an empty completion");

  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as T;
}
