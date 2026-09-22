# Yume 夢

> *ゆめ — "dream": you've been pulled into a living dream, and the old belief of* kotodama (言霊) *holds here — spoken words carry the power to shape reality.*

An immersive Japanese language-learning game built on [Orbis](https://www.reactor.inc/models/visko-orbis-stable), Visko's real-time steerable video model. You're pulled into a living, AI-generated dream world — and the only way to change it is to correctly describe the change **in Japanese**. Get it right, and the world visibly moves, live, in front of you.

Built for the [Visko Orbis Online Challenge](https://www.visko.ai/challenge/orbis-september-2026).

## The idea

Most language apps test you with flashcards and multiple choice. Yume tests you with **consequence**: you type or speak a Japanese sentence, and if — and only if — it actually communicates the target meaning, the live video world reacts. Say "ねこが こうえんに います" and a cat appears in the park, on screen, within about two seconds. Say something that doesn't land, and the world just... stays still.

That's comprehensible output made visible. It's also the whole reason this has to be built on a *live, steerable* video model rather than a one-shot generator — the world has to keep running and keep reacting to unpredictable input, turn after turn, which is exactly what Orbis's chunked `set_prompt` steering is designed for.

## How a turn works

1. Pick a world (Park, Classroom, Night City — each a short chain of objectives).
2. Read the English objective and a vocab hint.
3. Type (or use the 🎙️ mic) a Japanese sentence describing that change.
4. The server checks it — via Gemini if a key is configured, or an offline keyword-match grader if not — and returns feedback plus a corrected/model sentence.
5. If it's correct: the running scene description gets the new detail appended, `set_prompt` steers Orbis to it at the next chunk boundary, and the world visibly updates. The corrected sentence is also read aloud in a soft, anime-style Japanese voice (Fish Audio).
6. Four correct turns later, you've shaped an entire scene with nothing but Japanese.

## Stack

- **Orbis Stable** (via Reactor/`@reactor-team/js-sdk`) — the live video world, connected over WebRTC, steered with `set_prompt`
- **Gemini 2.5 Flash** (optional, `GEMINI_API_KEY`) — grades each sentence for comprehensibility rather than strict grammar, and produces a natural corrected sentence; falls back to a local keyword-match grader when no key is set, so the game still works offline
- **Fish Audio** (`FISH_API_KEY`) — reads the corrected sentence aloud
- **Next.js 16 / React 19** — the app shell, forked from Visko's [official starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter)

## Setup

```bash
npm install
cp .env.example .env.local
# then fill in .env.local:
#   REACTOR_API_KEY   — from reactor.inc (required to actually connect to Orbis)
#   GEMINI_API_KEY    — optional, enables smarter grading
#   FISH_API_KEY      — optional, enables spoken feedback
npm run dev
```

Open <http://localhost:3000>, pick a world, and start talking to it.

## Project layout

```
data/scenarios.json         The three worlds: base scene prompt + a chain of objectives
lib/scenarios.ts            Scenario types + the offline keyword-match grader
components/isekai-game.tsx  The whole game: scenario picker, live turn loop, Orbis steering (Yume)
app/api/check-answer/       Grades a learner's sentence (Gemini, or offline fallback)
app/api/tts/                Proxies Fish Audio for spoken feedback
app/api/token/, hooks/…     Unmodified from the Visko starter — token minting + Orbis session
```

## Why this fits the challenge

- **Real-time interaction is load-bearing.** There's no version of this app that works with pre-rendered video — the world must react to whatever the learner just said, correctly or not, every single turn.
- **Creativity.** It reframes "video generation" as a *comprehension check* rather than a content-creation tool.
- **Functionality.** The loop is small and legible: say something → watch the world respond (or not) → try again. A judge can see the whole mechanic in under a minute.

がんばってください！ 🌸
