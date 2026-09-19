import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const require = createRequire(import.meta.url);
const projectDirectory = process.cwd();
const registryPath = path.join(projectDirectory, ".reactor-dev-sessions.json");
const reactorApiUrl = "https://api.reactor.inc";
const orbisModel = "reactor/visko-orbis-stable";

loadEnvConfig(projectDirectory);

async function findActiveDevServer() {
  try {
    const lock = JSON.parse(
      await fs.readFile(path.join(projectDirectory, ".next/dev/lock"), "utf8"),
    );
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return undefined;
    try {
      process.kill(lock.pid, 0);
      return lock;
    } catch (error) {
      if (error?.code === "ESRCH") return undefined;
      throw error;
    }
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function readRegistry() {
  try {
    const contents = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(contents);
    if (
      !Array.isArray(parsed.sessions) ||
      !parsed.sessions.every(
        (session) =>
          session &&
          typeof session.sessionId === "string" &&
          session.model === orbisModel &&
          typeof session.registeredAt === "string",
      )
    ) {
      throw new Error("session registry has an invalid format");
    }
    return parsed.sessions;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegistry(sessions) {
  const temporaryPath = `${registryPath}.${process.pid}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify({ sessions }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.rename(temporaryPath, registryPath);
}

async function cleanupTrackedSessions(reason) {
  const sessions = await readRegistry();
  if (sessions.length === 0) return;

  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      `Cannot clean ${sessions.length} tracked Reactor session(s): REACTOR_API_KEY is missing`,
    );
  }

  console.log(
    `[reactor-cleanup] ${reason}: deleting ${sessions.length} tracked session(s)`,
  );
  const remaining = [];
  for (const session of sessions) {
    try {
      const response = await fetch(
        `${reactorApiUrl}/sessions/${encodeURIComponent(session.sessionId)}`,
        {
          method: "DELETE",
          headers: { "Reactor-API-Key": apiKey },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.ok || response.status === 404) {
        console.log(`[reactor-cleanup] deleted ${session.sessionId}`);
      } else {
        console.error(
          `[reactor-cleanup] ${session.sessionId}: Reactor returned ${response.status}`,
        );
        remaining.push(session);
      }
    } catch (error) {
      console.error(
        `[reactor-cleanup] ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      remaining.push(session);
    }
  }

  await writeRegistry(remaining);
  if (remaining.length > 0) {
    throw new Error(
      `Could not clean ${remaining.length} tracked Reactor session(s); refusing to start another dev server`,
    );
  }
}

try {
  const activeServer = await findActiveDevServer();
  if (activeServer) {
    throw new Error(
      `Another Next.js dev server is already running (PID ${activeServer.pid}, ${activeServer.appUrl ?? "URL unknown"}); refusing to clean its sessions`,
    );
  }
  await cleanupTrackedSessions("startup sweep");
} catch (error) {
  console.error(
    `[reactor-cleanup] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: projectDirectory,
  env: process.env,
  stdio: "inherit",
});

let shuttingDown = false;

async function shutdown(signal, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (signal && child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }

  try {
    await cleanupTrackedSessions("shutdown sweep");
  } catch (error) {
    console.error(
      `[reactor-cleanup] ${error instanceof Error ? error.message : String(error)}`,
    );
    exitCode = 1;
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown("SIGINT", 130));
process.once("SIGTERM", () => void shutdown("SIGTERM", 143));
child.once("exit", (code, signal) => {
  const exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  void shutdown(undefined, exitCode);
});
