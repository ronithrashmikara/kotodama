# Visko Orbis Online Challenge — Project Summary

## The Challenge

**Name:** Visko Orbis Online Challenge
**Organizer:** Visko
**Goal:** Build an application with **Orbis** (a live video model that generates and responds to real-time changes) where real-time interaction is actually load-bearing to the experience.

**Judging criteria (in order of weight):**
1. Real-time interaction — how essential Orbis's live/steerable capability is to the experience
2. Creativity — originality and a compelling use case beyond conventional video
3. Functionality — whether the prototype tangibly demonstrates the concept

**Prizes:** 1st $4,000 · 2nd $2,000 · 3rd $1,000
**Team size:** up to 5, solo allowed
**Deadline:** September 24, 2026, 12:00 PM PT
**Tools provided:** official starter repo, Reactor API access (needs approval — $250 in credits per approved participant), optional Gemini API

## The Idea: Kotodama (言霊)

*ことだま — "word spirit": the old Japanese belief that spoken words carry the power to shape reality.*

An immersive Japanese language-learning game. You're pulled into a living, AI-generated world — and the only way to change it is to correctly describe the change **in Japanese**. Get it right, and the live video world visibly reacts, within seconds, in front of you. Get it wrong, and nothing happens.

This isn't a video-generation demo wearing a language-app skin: the core loop is *comprehensible output made visible*. It only works because Orbis is live and steerable — a one-shot or pre-rendered video model can't react to unpredictable learner input turn after turn, which is exactly what the judging criteria are weighted to reward.

## What We Actually Built

- **Three playable worlds** (`data/scenarios.json`): Park, Classroom, Night City — each a short chain of 4 objectives (e.g. "tell the world there's a cat in the park"), with a base scene prompt, required-keyword grading, a sample answer, and a scene-description addition that gets appended to the running Orbis prompt on a correct answer.
- **The game loop** (`components/isekai-game.tsx`): scenario picker → connects to Orbis via the official Reactor SDK → learner types (or speaks, via the browser's built-in mic/Web Speech API) a Japanese sentence → grading → on success, `set_prompt` steers the live world to the updated scene description at the next chunk boundary, and the corrected sentence is read aloud.
- **Grading** (`app/api/check-answer/route.ts`): tries Gemini 2.5 Flash first for comprehension-based grading (small grammar mistakes still count as correct — this is about being understood, not perfect grammar) and a natural corrected sentence; falls back to an offline keyword-match grader (`lib/scenarios.ts`) if no Gemini key is configured, so the game still works without it.
- **Spoken feedback** (`app/api/tts/route.ts`): Fish Audio TTS reads the corrected Japanese sentence aloud in a soft, anime-style voice.
- **Everything else** (token minting, WebRTC session handling, resolution/image staging) is the unmodified Visko starter kit, since it's already a solid, tested reference implementation.

Verified working end-to-end except the live Orbis connection itself: `npm run build` compiles clean, the scenario picker renders correctly, the grader was tested with both correct and incorrect Japanese input and graded accurately, and TTS generates real audio. The one piece we couldn't test is the actual live-video loop, because Reactor API approval hadn't come through as of building this.

## Status

Blocked on Reactor API key approval (requested, followed up by email). Everything else is ready to go — once the key lands, it's a `.env.local` edit away from a working live demo.

## Where It Lives

- **Local folder:** `C:\Users\Ronit\Downloads\Isekai`
- **GitHub (private):** https://github.com/ronithrashmikara/kotodama
