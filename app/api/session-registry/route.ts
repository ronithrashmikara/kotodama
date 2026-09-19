import { NextResponse } from "next/server";

import {
  registerReactorSession,
  unregisterReactorSession,
} from "@/lib/server/reactor-session-registry";

export const runtime = "nodejs";

const REACTOR_API_URL = "https://api.reactor.inc";
const MODEL_NAME = "reactor/visko-orbis-stable";

type RegistryRequest = {
  sessionId?: unknown;
  jwt?: unknown;
};

function unavailableInProduction() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return unavailableInProduction();
  }

  let body: RegistryRequest;
  try {
    body = (await request.json()) as RegistryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, jwt } = body;
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    sessionId.length > 200 ||
    typeof jwt !== "string" ||
    !jwt ||
    jwt.length > 16_384
  ) {
    return NextResponse.json(
      { error: "A valid sessionId and JWT are required" },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${REACTOR_API_URL}/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not verify Reactor session" },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Reactor session verification failed" },
      { status: response.status },
    );
  }

  const session = (await response.json()) as {
    model?: string | { name?: string };
    closed?: boolean;
    state?: string;
  };
  const sessionModel =
    typeof session.model === "string" ? session.model : session.model?.name;
  if (
    sessionModel !== MODEL_NAME ||
    session.closed === true ||
    session.state?.toUpperCase() === "CLOSED"
  ) {
    return NextResponse.json(
      { error: "Session is not an active Orbis Stable session" },
      { status: 400 },
    );
  }

  await registerReactorSession({
    sessionId,
    model: MODEL_NAME,
    registeredAt: new Date().toISOString(),
  });
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return unavailableInProduction();
  }

  let body: RegistryRequest;
  try {
    body = (await request.json()) as RegistryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !body.sessionId) {
    return NextResponse.json(
      { error: "A sessionId is required" },
      { status: 400 },
    );
  }

  await unregisterReactorSession(body.sessionId);
  return new Response(null, { status: 204 });
}
