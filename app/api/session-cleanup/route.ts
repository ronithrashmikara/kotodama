import { NextResponse } from "next/server";

import { unregisterReactorSession } from "@/lib/server/reactor-session-registry";

export const runtime = "nodejs";

const REACTOR_API_URL = "https://api.reactor.inc";

type CleanupRequest = {
  sessionId?: unknown;
  jwt?: unknown;
};

export async function POST(request: Request) {
  let body: CleanupRequest;
  try {
    body = (await request.json()) as CleanupRequest;
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
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach Reactor for session cleanup" },
      { status: 502 },
    );
  }

  // Cleanup is idempotent: a missing session has already been terminated.
  if (response.ok || response.status === 404) {
    if (process.env.NODE_ENV === "development") {
      await unregisterReactorSession(sessionId);
    }
    return new Response(null, { status: 204 });
  }

  return NextResponse.json(
    { error: "Reactor session cleanup failed" },
    { status: response.status },
  );
}
