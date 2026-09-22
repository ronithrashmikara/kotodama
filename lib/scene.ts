// The running scene is a log of everything that has happened, not a string we
// keep gluing onto. That gives us two things from one structure: the prompt we
// send Orbis, and the "here's what you changed" timeline at the end.

export type SceneSource = "you" | "world" | "companion";

export type SceneEvent = {
  /** English fragment appended to the Orbis prompt. */
  text: string;
  source: SceneSource;
  at: number;
  /** What the player actually said, when they caused it. */
  said?: string;
};

// Orbis gets the base scene plus only the most recent additions. Without this
// cap an ambient world that drifts every ~20s would grow the prompt without
// limit, and the earliest details would fight the newest ones for attention.
const MAX_RECENT = 6;

export function composeScene(basePrompt: string, events: SceneEvent[]): string {
  const recent = events.slice(-MAX_RECENT);
  if (!recent.length) return basePrompt;
  return `${basePrompt} ${recent.map((e) => e.text.replace(/\.$/, "")).join(". ")}.`;
}

export function addEvent(events: SceneEvent[], event: Omit<SceneEvent, "at">): SceneEvent[] {
  return [...events, { ...event, at: Date.now() }];
}
