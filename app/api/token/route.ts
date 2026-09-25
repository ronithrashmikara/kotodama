import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { allowance, budgetAllows, noteDreamStarted, PASS_COOKIE, passCookie, quotaOn, readPass } from "@/lib/server/quota";

const REACTOR_API_URL = "https://api.reactor.inc";
const MODEL_NAME = "reactor/visko-orbis-stable";

export async function POST() {
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Each token is one dream of up to five minutes (see lib/server/quota.ts).
  const jar = await cookies();
  const pass = readPass(jar.get(PASS_COOKIE)?.value);
  if (quotaOn()) {
    if (pass.used >= allowance(pass)) {
      return NextResponse.json({ error: "quota:visitor", dreamsLeft: 0 }, { status: 429 });
    }
    if (!(await budgetAllows(pass.judge))) {
      return NextResponse.json({ error: "quota:budget", dreamsLeft: allowance(pass) - pass.used }, { status: 429 });
    }
  }

  const response = await fetch(`${REACTOR_API_URL}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Reactor-API-Key": apiKey,
    },
    body: JSON.stringify({
      expires_after: 3600,
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: [MODEL_NAME] } },
          constraints: { max_sessions: 1, max_session_duration_seconds: 300 },
        },
      ],
    }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    return NextResponse.json(
      { error: `Reactor token request failed (${response.status}): ${text}` },
      { status: response.status },
    );
  }

  const result = JSON.parse(text) as { jwt?: string };
  if (!result.jwt) {
    return NextResponse.json({ error: "Reactor returned no JWT" }, { status: 502 });
  }

  const used = { ...pass, used: pass.used + 1 };
  jar.set(passCookie(used));
  noteDreamStarted();
  return NextResponse.json(
    { jwt: result.jwt, dreamsLeft: Math.max(0, allowance(used) - used.used) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
