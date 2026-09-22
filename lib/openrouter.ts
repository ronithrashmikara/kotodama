// Shared OpenRouter client for the two places that need a model: grading a
// learner's answer and narrating the live scene. Both want one small JSON
// response inside the game loop, so neither uses reasoning or streaming.

export const GRADER_MODEL = "anthropic/claude-sonnet-5";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/ronithrashmikara/kotodama",
      "X-Title": "Yume",
    },
    body: JSON.stringify({
      model: GRADER_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenRouter returned an empty completion");

  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as T;
}
