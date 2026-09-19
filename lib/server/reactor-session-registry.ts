import { promises as fs } from "node:fs";
import path from "node:path";

export const REACTOR_SESSION_REGISTRY = path.join(
  process.cwd(),
  ".reactor-dev-sessions.json",
);

export type RegisteredReactorSession = {
  sessionId: string;
  model: string;
  registeredAt: string;
};

let registryQueue: Promise<unknown> = Promise.resolve();

async function readRegistry(): Promise<RegisteredReactorSession[]> {
  try {
    const contents = await fs.readFile(REACTOR_SESSION_REGISTRY, "utf8");
    const parsed = JSON.parse(contents) as { sessions?: unknown };
    if (
      !Array.isArray(parsed.sessions) ||
      !parsed.sessions.every(
        (session): session is RegisteredReactorSession =>
          typeof session === "object" &&
          session !== null &&
          typeof (session as RegisteredReactorSession).sessionId === "string" &&
          typeof (session as RegisteredReactorSession).model === "string" &&
          typeof (session as RegisteredReactorSession).registeredAt === "string",
      )
    ) {
      throw new Error("session registry has an invalid format");
    }
    return parsed.sessions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistry(sessions: RegisteredReactorSession[]) {
  const temporaryPath = `${REACTOR_SESSION_REGISTRY}.${process.pid}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify({ sessions }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.rename(temporaryPath, REACTOR_SESSION_REGISTRY);
}

function mutateRegistry(
  mutation: (
    sessions: RegisteredReactorSession[],
  ) => RegisteredReactorSession[],
) {
  const operation = registryQueue.then(async () => {
    const sessions = await readRegistry();
    await writeRegistry(mutation(sessions));
  });
  registryQueue = operation.catch(() => undefined);
  return operation;
}

export function registerReactorSession(
  session: RegisteredReactorSession,
) {
  return mutateRegistry((sessions) => [
    ...sessions.filter((item) => item.sessionId !== session.sessionId),
    session,
  ]);
}

export function unregisterReactorSession(sessionId: string) {
  return mutateRegistry((sessions) =>
    sessions.filter((item) => item.sessionId !== sessionId),
  );
}
