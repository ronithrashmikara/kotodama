import scenariosData from "@/data/scenarios.json";

export type ScenarioStep = {
  objectiveEn: string;
  hintJp: string;
  requiredAll: string[];
  sampleAnswer: string;
  sceneAdd: string;
};

export type Scenario = {
  id: string;
  titleJp: string;
  titleEn: string;
  basePrompt: string;
  steps: ScenarioStep[];
};

export const SCENARIOS = scenariosData as Scenario[];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

// Builds a synthetic Scenario for the free-form "create your own world" mode.
// It has no fixed steps — the game loop treats an empty `steps` array as a
// signal to run in open-ended freeform play instead of a fixed 4-step chain.
export function buildFreeformScenario(ideaEn: string): Scenario {
  const idea = ideaEn.trim();
  return {
    id: "freeform",
    titleJp: "じゆうな せかい",
    titleEn: idea,
    basePrompt: `${idea}. Anime-style painterly background art, calm and still, nothing happening yet.`,
    steps: [],
  };
}

// Normalizes learner input for the offline fallback check: strips
// punctuation/whitespace so word-order and particle differences do not
// cause an unfair miss.
export function normalizeJapanese(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[。、！？\s「」『』・.,!?]/g, "")
    .toLowerCase();
}

export function localCheck(step: ScenarioStep, learnerText: string) {
  const normalized = normalizeJapanese(learnerText);
  const hits = step.requiredAll.filter((word) => normalized.includes(word));
  return {
    correct: hits.length === step.requiredAll.length && normalized.length > 0,
    missing: step.requiredAll.filter((word) => !normalized.includes(word)),
  };
}

/**
 * Choice mode: no typing, no speaking — you read two kana-only options and
 * pick one. It is the lowest-barrier way in, and the only mode someone who
 * reads no Japanese at all can still play.
 */
export function buildChoiceScenario(): Scenario {
  return {
    id: "choices",
    titleJp: "えらぶ",
    titleEn: "Choose the story",
    basePrompt:
      "A quiet anime-style park at golden hour, cherry blossom trees along a winding path, " +
      "soft warm light, painterly studio-anime background art, calm and still.",
    steps: [],
  };
}
