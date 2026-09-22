# Yume 夢

> *ゆめ — "dream": you've been pulled into a living dream, and the old belief of* kotodama (言霊) *holds here — spoken words carry the power to shape reality.*

An immersive Japanese language-learning game built on [Orbis](https://www.reactor.inc/models/visko-orbis-stable), Visko's real-time steerable video model. You're pulled into a living, AI-generated dream world — and the only way to change it is to correctly describe the change **in Japanese**. Get it right, and the world visibly moves, live, in front of you.

Built for the [Visko Orbis Online Challenge](https://www.visko.ai/challenge/orbis-september-2026).

## The idea

Most language apps test you with flashcards and multiple choice. Yume tests you with **consequence**: you type or speak a Japanese sentence, and if — and only if — it actually communicates the meaning, the live video world reacts. Say "ねこが こうえんに います" and a cat appears in the park, on screen, within about two seconds. Say something that doesn't land, and the world just... stays still.

That's comprehensible output made visible. It's also the whole reason this has to be built on a *live, steerable* video model rather than a one-shot generator — the world has to keep running and keep reacting to unpredictable input, turn after turn, which is exactly what Orbis's chunked `set_prompt` steering is designed for.

## How a turn works

1. Pick a world (Park, Classroom, Night City — each a short chain of objectives — or describe your own from scratch in Free World mode).
2. The narrator describes the current scene in Japanese, sized to your level, and reads it aloud (Fish Audio). Every word is individually hoverable for its reading + meaning, and double-clicking one saves it to your personal vocab list.
3. Type (or use the 🎙️ mic) a Japanese answer at your chosen difficulty — anywhere from a single word up to a full description.
4. The server grades it with GPT-OSS 120B on Groq if a key is configured, or an offline keyword-match grader if not, and returns feedback plus a corrected sentence.
5. If it's correct: the running scene description gets the new detail appended, `set_prompt` steers Orbis to it at the next chunk boundary, and the world visibly updates — the narrator then describes the *new* scene as the reward. A wrong answer instead hears the correction spoken back.
6. Four correct turns later (or whenever you like, in Free World mode), you've shaped an entire scene with nothing but Japanese.

## Difficulty levels

Grading and narration both scale with a level picker in the HUD:

| Level | What you answer with |
|---|---|
| ひとこと — Single word | One correct word is a full answer |
| フレーズ — Short phrase | 2–4 words, particles optional |
| ぶん — Full sentence | A complete sentence, particles + a verb |
| びょうしゃ — Description | Multiple connected clauses |

## Stack

- **Orbis Stable** (via Reactor/`@reactor-team/js-sdk`) — the live video world, connected over WebRTC, steered with `set_prompt`
- **GPT-OSS 120B on Groq** (`GROQ_API_KEY`) — grades each answer for comprehensibility rather than strict grammar, and narrates the live scene; both calls sit in the live game loop, so Groq's ~500 tok/s inference keeps them fast enough to feel real-time. Falls back to a local keyword-match grader when no key is set, so the game still works offline
- **Fish Audio** (`FISH_API_KEY`) — narrates the world and reads corrections aloud in a soft, anime-style Japanese voice
- **Next.js 16 / React 19** — the app shell, forked from Visko's [official starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter)

## Setup

```bash
npm install
cp .env.example .env.local
# then fill in .env.local:
#   REACTOR_API_KEY   — from reactor.inc (required to actually connect to Orbis)
#   GROQ_API_KEY      — optional, enables Groq-graded answers + live narration
#   FISH_API_KEY      — optional, enables spoken narration/feedback
npm run dev
```

Open <http://localhost:3000>, pick a world, and start talking to it.

## Project layout

```
data/scenarios.json         The three worlds: base scene prompt + a chain of objectives
lib/scenarios.ts            Scenario types + the offline keyword-match grader
lib/levels.ts               The difficulty ladder (single word → full description)
lib/groq.ts                 Shared Groq (GPT-OSS 120B) JSON-completion client
lib/vocab.ts                Saved-word list, persisted in localStorage
components/isekai-game.tsx  The whole game: scenario picker, live turn loop, Orbis steering
components/narration.tsx    The narrator's line — hoverable/clickable/savable words
components/vocab-panel.tsx  Your saved-words panel
app/api/check-answer/       Grades a learner's answer (Groq, or offline fallback)
app/api/narrate/            Narrates the current scene, pre-segmented into glossable words
app/api/tts/                Proxies Fish Audio for spoken narration/feedback
app/api/token/, hooks/…     Unmodified from the Visko starter — token minting + Orbis session
```

## Why this fits the challenge

- **Real-time interaction is load-bearing.** There's no version of this app that works with pre-rendered video — the world must react to whatever the learner just said, correctly or not, every single turn.
- **Creativity.** It reframes "video generation" as a *comprehension check* rather than a content-creation tool, with a full difficulty ladder and a free-form mode for total creative freedom.
- **Functionality.** The loop is small and legible: hear the world → say something → watch it respond (or not) → try again. A judge can see the whole mechanic in under a minute.

がんばってください！ 🌸
