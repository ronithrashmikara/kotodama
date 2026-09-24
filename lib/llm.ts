// The one place Yume calls a language model: grading answers, narrating the
// scene, voicing Hina, drifting the world, and building beginner cards. Every
// call sits in the live game loop — the player is waiting for the world to
// react — so speed matters as much as quality, and so does never stalling.
//
// The model is GPT-OSS 120B, served by whichever fast provider is configured:
//
//   Cerebras  ~3,000 tokens/s   CEREBRAS_API_KEY   tried first when present
//   Groq        ~500 tokens/s   GROQ_API_KEY       the fallback, or the only one
//
// Both speak the OpenAI chat format, so one request shape serves either. When a
// provider rate-limits, errors or hangs, the call moves to the next one at once,
// and a rate-limited provider is skipped until its limit resets — so the free
// tiers of the two back each other up mid-session.

type ProviderName = "cerebras" | "groq";

type Provider = {
  name: ProviderName;
  url: string;
  key: string;
  model: string;
  /** Parameters only this provider understands. */
  extra: Record<string, unknown>;
};

function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.CEREBRAS_API_KEY) {
    list.push({
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: process.env.CEREBRAS_API_KEY,
      model: "gpt-oss-120b",
      extra: {},
    });
  }
  if (process.env.GROQ_API_KEY) {
    list.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: "openai/gpt-oss-120b",
      // GPT-OSS is a reasoning model — without this Groq leaks its
      // chain-of-thought into `content` and breaks JSON mode (a 400 with an
      // empty failed_generation). Cerebras returns reasoning separately.
      extra: { include_reasoning: false },
    });
  }
  // LLM_PROVIDER=groq keeps Groq first even when a Cerebras key is present.
  const preferred = process.env.LLM_PROVIDER;
  return preferred ? [...list.filter((p) => p.name === preferred), ...list.filter((p) => p.name !== preferred)] : list;
}

/** Whether any model provider is configured at all. */
export function hasModel(): boolean {
  return providers().length > 0;
}

// A provider that just rate-limited us, or refused its key, is skipped until
// this time (per server instance — enough to stop every call paying for a
// known failure first).
const coolingUntil = new Map<ProviderName, number>();

/** A hung provider must not hold the world still; give up and fail over. */
const TIMEOUT_MS = 8_000;

/** The provider cannot serve us for a while: rate-limited, or a key it refuses. */
class Unavailable extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
  }
}

/**
 * The model produced JSON that does not parse — a one-off glitch (a stray
 * "{" inside Hina's word list, seen live), not a pattern, so worth one retry.
 */
class Malformed extends Error {}

async function callProvider<T>(
  p: Provider,
  { system, user, temperature, maxTokens }: { system: string; user: string; temperature: number; maxTokens: number },
): Promise<T> {
  const response = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // Low effort keeps replies fast; the thinking these calls need is small.
      reasoning_effort: "low",
      ...p.extra,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new Unavailable(
      `${p.name} rate-limited: ${await response.text()}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000,
    );
  }
  // A missing or revoked key will not fix itself mid-session; stop paying a
  // round trip for it on every call.
  if (response.status === 401 || response.status === 403) {
    throw new Unavailable(`${p.name} refused the key (${response.status})`, 10 * 60_000);
  }
  if (!response.ok) {
    const body = await response.text();
    // Groq validates JSON mode itself and answers 400 when the model slips.
    if (body.includes("json_validate_failed")) throw new Malformed(`${p.name} generated invalid JSON`);
    throw new Error(`${p.name} returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Malformed(`${p.name} returned an empty completion`);

  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as T;
  } catch {
    throw new Malformed(`${p.name} returned JSON that does not parse`);
  }
}

export async function chatJson<T>({
  system,
  user,
  temperature = 0.3,
  maxTokens = 700,
}: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const all = providers();
  if (!all.length) throw new Error("No model provider is configured (CEREBRAS_API_KEY or GROQ_API_KEY)");

  // Providers still cooling down go last rather than being dropped: if every
  // provider is limited, the one that frees up soonest is still worth a try.
  const now = Date.now();
  const order = [...all].sort(
    (a, b) => Math.max(0, (coolingUntil.get(a.name) ?? 0) - now) - Math.max(0, (coolingUntil.get(b.name) ?? 0) - now),
  );

  let lastError: unknown;
  for (const p of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callProvider<T>(p, { system, user, temperature, maxTokens });
      } catch (error) {
        lastError = error;
        if (error instanceof Unavailable) coolingUntil.set(p.name, Date.now() + error.retryAfterMs);
        // A malformed reply gets one more try here; anything else — a limit,
        // a 5xx, a timeout — moves straight on to the next provider.
        if (!(error instanceof Malformed) || attempt > 0) break;
      }
    }
  }
  throw lastError;
}
