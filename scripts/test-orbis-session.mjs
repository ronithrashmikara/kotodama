#!/usr/bin/env node
// Provisions ONE real Orbis GPU session, confirms it reaches `ready`, reports
// how long that took, then terminates it immediately.
//
// This is the one thing that cannot be verified for free: whether the account
// can actually get a GPU. Video rendering and steering ride the WebRTC data
// channel and still need a browser.
//
// Cost safety, in layers:
//   1. The JWT itself caps the session at MAX_SESSION_SECONDS — even if this
//      process is killed, Reactor tears the session down at that limit.
//   2. Termination runs in a `finally`, plus on SIGINT/SIGTERM and on any
//      uncaught error.
//   3. A watchdog aborts and cleans up if `ready` never arrives.
//
//   node scripts/test-orbis-session.mjs

import fs from "node:fs";
import path from "node:path";

const API = "https://api.reactor.inc";
const MODEL = "reactor/visko-orbis-stable";
const USD_PER_SEC = 0.0097;
const MAX_SESSION_SECONDS = 90; // hard ceiling => worst case ~$0.87
const READY_TIMEOUT_MS = 75_000;

const envText = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const apiKey =
  process.env.REACTOR_API_KEY ?? envText.match(/^REACTOR_API_KEY=(.+)$/m)?.[1]?.trim();

if (!apiKey || apiKey.startsWith("replace_with_")) {
  console.error("REACTOR_API_KEY is missing or still a placeholder.");
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  let jwt = null;
  let sessionId = null;
  let createdAt = null;

  const terminate = async (why) => {
    if (!sessionId || !jwt) return;
    const id = sessionId;
    sessionId = null; // guard against double-termination
    const held = ((Date.now() - createdAt) / 1000).toFixed(1);
    try {
      const res = await fetch(`${API}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const okish = res.ok || res.status === 404;
      console.log(
        `\n  ${okish ? "\x1b[32mTERMINATED\x1b[0m" : "\x1b[31mTERMINATE FAILED\x1b[0m"} ` +
          `(${why}) after ${held}s  ≈ $${(held * USD_PER_SEC).toFixed(2)}`,
      );
      if (!okish) {
        console.log(`  Reactor said ${res.status}. The ${MAX_SESSION_SECONDS}s token cap still applies.`);
      }
    } catch (caught) {
      console.log(`\n  \x1b[31mTERMINATE ERRORED\x1b[0m: ${caught.message}`);
      console.log(`  The ${MAX_SESSION_SECONDS}s token cap will still stop the meter.`);
    }
  };

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      await terminate(sig);
      process.exit(130);
    });
  }

  console.log("\n\x1b[1mOrbis live session test\x1b[0m");
  console.log(`  Session capped at ${MAX_SESSION_SECONDS}s => worst case $${(MAX_SESSION_SECONDS * USD_PER_SEC).toFixed(2)}\n`);

  try {
    // --- Mint a tightly-scoped JWT (free) --------------------------------
    const tokenRes = await fetch(`${API}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Reactor-API-Key": apiKey },
      body: JSON.stringify({
        expires_after: 600,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: [MODEL] } },
            constraints: { max_sessions: 1, max_session_duration_seconds: MAX_SESSION_SECONDS },
          },
        ],
      }),
    });
    if (!tokenRes.ok) throw new Error(`token mint failed ${tokenRes.status}: ${await tokenRes.text()}`);
    jwt = (await tokenRes.json()).jwt;
    console.log("  token      minted (no GPU held yet, $0.00)");

    // --- Create the session. THE METER STARTS HERE. ----------------------
    createdAt = Date.now();
    const createRes = await fetch(`${API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ model: { name: MODEL } }),
    });
    const createBody = await createRes.text();
    if (!createRes.ok) {
      console.log(`  \x1b[31mcreate     FAILED ${createRes.status}\x1b[0m: ${createBody.slice(0, 400)}`);
      console.log("  No session was created, so nothing is billing.\n");
      process.exitCode = 1;
      return;
    }

    const created = JSON.parse(createBody);
    sessionId = created.id ?? created.session_id ?? created.session?.id;
    console.log(`  create     ok — session ${sessionId}`);
    console.log(`             \x1b[33mmeter running\x1b[0m from this moment`);
    if (!sessionId) throw new Error(`no session id in response: ${createBody.slice(0, 300)}`);

    // --- Poll for ready --------------------------------------------------
    // The REST API reports CREATED -> ACTIVE -> CLOSED. ACTIVE means the GPU
    // is assigned. ("ready" is the SDK's *client-side* WebRTC state and never
    // appears here — polling for it just burns GPU time on a live session.)
    let status = created.status ?? created.state ?? "unknown";
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let reachedReady = false;

    while (Date.now() < deadline) {
      const elapsed = ((Date.now() - createdAt) / 1000).toFixed(1);
      process.stdout.write(`\r  status     ${String(status).padEnd(14)} ${elapsed}s  $${(elapsed * USD_PER_SEC).toFixed(2)}   `);
      if (["ACTIVE", "READY", "ready"].includes(String(status))) {
        reachedReady = true;
        break;
      }
      if (["FAILED", "CLOSED", "TERMINATED", "ERROR"].includes(String(status).toUpperCase())) break;

      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!pollRes.ok) {
        console.log(`\n  poll failed ${pollRes.status}: ${(await pollRes.text()).slice(0, 200)}`);
        break;
      }
      const body = await pollRes.json();
      status = body.status ?? body.state ?? status;
    }

    const readyAt = ((Date.now() - createdAt) / 1000).toFixed(1);
    if (reachedReady) {
      console.log(`\n\n  \x1b[32mGPU ASSIGNED\x1b[0m — reached ACTIVE in ${readyAt}s`);
      console.log("  The account can provision Orbis. Browser take is good to go.");
    } else {
      console.log(`\n\n  \x1b[33mDid not reach ACTIVE\x1b[0m within ${readyAt}s (last status: ${status})`);
    }
  } catch (caught) {
    console.log(`\n  \x1b[31mERROR\x1b[0m ${caught.message}`);
    process.exitCode = 1;
  } finally {
    await terminate("test complete");
    console.log("");
  }
}
