#!/usr/bin/env node
// Pre-recording check for the Reactor/Orbis pipeline.
//
// Minting a token holds no GPU, so this validates the key, the model grant,
// and the exact live rate for FREE — no credits burned. Run it before a take
// instead of discovering a bad key halfway through a recording.
//
//   node scripts/preflight-reactor.mjs

import fs from "node:fs";
import path from "node:path";

const REACTOR_API_URL = "https://api.reactor.inc";
const MODEL_NAME = "reactor/visko-orbis-stable";

const envPath = path.resolve(process.cwd(), ".env.local");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const readEnv = (name) =>
  process.env[name] ?? envText.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();

const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
const warn = (m) => console.log(`  \x1b[33mWARN\x1b[0m  ${m}`);

let failed = false;

console.log("\n\x1b[1mReactor / Orbis preflight\x1b[0m  (no GPU held — this costs nothing)\n");

// --- 1. Keys present -------------------------------------------------------
console.log("Keys");
const reactorKey = readEnv("REACTOR_API_KEY");
if (!reactorKey || reactorKey.startsWith("replace_with_")) {
  bad("REACTOR_API_KEY is missing or still the placeholder");
  failed = true;
} else {
  ok(`REACTOR_API_KEY present (${reactorKey.slice(0, 6)}…)`);
}

for (const [name, label] of [
  ["GROQ_API_KEY", "grading + narration"],
  ["FISH_API_KEY", "spoken narration"],
]) {
  const v = readEnv(name);
  if (!v || v.startsWith("replace_with_")) warn(`${name} missing — ${label} will degrade`);
  else ok(`${name} present — ${label}`);
}

// --- 2. Live rate ----------------------------------------------------------
console.log("\nPricing (live from Reactor)");
let usdPerSec = null;
try {
  const res = await fetch(`${REACTOR_API_URL}/pricing`);
  const data = await res.json();
  const model = data.models?.find((m) => m.name === "visko-orbis-stable");
  if (!model) throw new Error("visko-orbis-stable not listed");
  usdPerSec = Number(model.rate.amount_per_sec_usd);
  ok(`visko-orbis-stable = $${usdPerSec.toFixed(4)}/sec ($${(usdPerSec * 60).toFixed(3)}/min)`);
} catch (caught) {
  warn(`Could not read live pricing: ${caught.message}`);
}

// --- 3. Token mint (proves the key + model grant, holds no GPU) ------------
console.log("\nToken mint");
if (reactorKey && !reactorKey.startsWith("replace_with_")) {
  try {
    const res = await fetch(`${REACTOR_API_URL}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Reactor-API-Key": reactorKey },
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
    const text = await res.text();
    if (!res.ok) {
      bad(`Reactor rejected the token request (${res.status}): ${text.slice(0, 300)}`);
      failed = true;
    } else if (!JSON.parse(text).jwt) {
      bad("Reactor returned 200 but no JWT");
      failed = true;
    } else {
      ok("Minted a session JWT — key is valid and granted for visko-orbis-stable");
      ok("Session cap is 300s, so one orphaned session can cost at most "
        + `$${usdPerSec ? (usdPerSec * 300).toFixed(2) : "2.91"}`);
    }
  } catch (caught) {
    bad(`Token request failed: ${caught.message}`);
    failed = true;
  }
}

// --- 4. Budget table -------------------------------------------------------
if (usdPerSec) {
  console.log("\nWhat a take costs");
  for (const [label, secs] of [
    ["30s rehearsal", 30],
    ["2min demo take", 120],
    ["5min (session cap)", 300],
  ]) {
    console.log(`  ${label.padEnd(20)} $${(usdPerSec * secs).toFixed(2)}`);
  }
  console.log(
    `\n  $250 of credit ≈ ${Math.floor(250 / (usdPerSec * 60))} minutes ` +
      `≈ ${Math.floor(250 / (usdPerSec * 120))} full 2-minute takes`,
  );
  console.log(
    "\n  Note: Reactor's docs describe billing as per session-MINUTE while the\n" +
      "  pricing API quotes a per-second rate. Plan as if short takes round up\n" +
      "  to a full minute, and check the dashboard after your first take.",
  );
}

console.log(
  failed
    ? "\n\x1b[31mNot ready.\x1b[0m Fix the failures above before recording.\n"
    : "\n\x1b[32mReady to record.\x1b[0m\n",
);
// Set the code rather than calling process.exit(), which can trip a libuv
// assertion on Windows while fetch's handles are still closing.
process.exitCode = failed ? 1 : 0;
