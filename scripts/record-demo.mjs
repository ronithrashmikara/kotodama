#!/usr/bin/env node
// One-command screen + mic recorder for the demo take.
//
//   node scripts/record-demo.mjs            # record screen + mic
//   node scripts/record-demo.mjs --no-audio # screen only
//
// Press Q (or Ctrl+C) in this terminal to stop. Each take is timestamped, so
// nothing ever overwrites a previous one.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "recordings");
const withAudio = !process.argv.includes("--no-audio");

// --- Find a microphone -----------------------------------------------------
function findMic() {
  try {
    const out = execSync("ffmpeg -list_devices true -f dshow -i dummy 2>&1", {
      encoding: "utf8",
      shell: "cmd.exe",
    });
    const mics = [...out.matchAll(/"([^"]+)"\s*\(audio\)/g)].map((m) => m[1]);
    // Prefer a real mic over a virtual/array device when both exist.
    return mics.find((m) => /realtek|headset|usb/i.test(m)) ?? mics[0] ?? null;
  } catch {
    return null;
  }
}

const mic = withAudio ? findMic() : null;

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = path.join(OUT_DIR, `yume-take-${stamp}.mp4`);

// --- Build the ffmpeg command ---------------------------------------------
const args = [
  "-hide_banner",
  "-loglevel", "error",
  "-stats",
  // Screen. gdigrab is the Windows desktop capture source.
  "-f", "gdigrab",
  "-framerate", "30",
  "-i", "desktop",
];

if (mic) {
  args.push("-f", "dshow", "-i", `audio=${mic}`);
}

args.push(
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  // yuv420p is what makes the file play everywhere (QuickTime, browsers,
  // YouTube's encoder) instead of only in VLC.
  "-pix_fmt", "yuv420p",
  // Round dimensions down to even numbers; libx264 rejects odd ones.
  "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
);

if (mic) {
  args.push("-c:a", "aac", "-b:a", "192k");
}

args.push("-movflags", "+faststart", outFile);

// --- Go --------------------------------------------------------------------
console.log("\n\x1b[1mYume demo recorder\x1b[0m");
console.log(`  screen   full desktop @ 30fps`);
console.log(`  audio    ${mic ? mic : "\x1b[33mnone (screen only)\x1b[0m"}`);
console.log(`  output   ${outFile}`);
console.log(
  "\n  \x1b[33mBefore you hit go:\x1b[0m close any terminal or editor showing\n" +
    "  .env.local — this captures your whole desktop, and those keys are live.\n",
);

let count = 5;
const tick = setInterval(() => {
  if (count > 0) {
    process.stdout.write(`\r  starting in ${count}…  `);
    count--;
    return;
  }
  clearInterval(tick);
  console.log("\r  \x1b[31m● RECORDING\x1b[0m — press Q here to stop.      \n");

  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });

  // ffmpeg finalises the MP4 container on 'q'. Killing it hard can leave an
  // unplayable file, so forward a graceful quit instead.
  const stop = () => {
    try {
      ff.stdin.write("q");
    } catch {
      ff.kill("SIGINT");
    }
  };
  process.on("SIGINT", stop);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (key) => {
      const k = key.toString().toLowerCase();
      if (k === "q" || k === "\u0003") stop();
    });
  }

  ff.on("close", () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    if (fs.existsSync(outFile)) {
      const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
      console.log(`\n\n  \x1b[32mSaved\x1b[0m ${outFile}  (${mb} MB)`);
      console.log("  Watch it back with sound before you rely on it.\n");
    } else {
      console.log("\n\n  \x1b[31mNo file was written.\x1b[0m Check the ffmpeg output above.\n");
    }
    process.exit(0);
  });
}, 1000);
