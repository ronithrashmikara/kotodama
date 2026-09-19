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
