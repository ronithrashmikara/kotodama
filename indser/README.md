# Record Yume like the reference

## Open the deck
Open `yume-slides.html` in a desktop browser. It works offline and embeds the artwork and styles.

- Arrow keys / Space: move between 6 slides.
- N: show timed presenter notes. Hide notes before recording.
- F: fullscreen.
- H: clean recording view, hiding controls and the camera placement guide.
- Escape: restore controls.
- Print / PDF: export all slides. Enable background graphics and disable browser headers/footers.

`SCRIPT.md` contains the full slide-by-slide narration, about three minutes fifteen seconds with demo pauses. `SHORT-CUT.md` is the shorter recording script. Edit content in `build-deck.mjs`, styling in `whiteboard.css`, then run `node indser/build-deck.mjs` from the project root. `slides.json` is an exported content copy, not the generator's input.

## What we borrowed from the reference
Inspected a contact sheet of sampled frames from the downloaded video, not a continuous audiovisual review. Observed: whiteboard background, handwritten headings, sparse content, pastel diagrams, an occasional image, circular face camera at lower right, and dark caption boxes near the bottom. The original moves around a large canvas. This deck uses discrete slides instead, so it is easy to record and print. It does not reproduce the reference's exact animation or claim to copy its pacing.

## Camera and captions
Record at 1920×1080. Place a circular camera crop at lower right, roughly 210–240 pixels wide, keeping important diagrams unobstructed. The dotted circle is a placement guide, not a webcam feature. H hides it. Record your camera separately or overlay it with your recording software.

Keep captions in the lower-center area above the slide footer. Use white text on a dark translucent background, no more than two lines. Face a window or soft light. Put the camera near eye level. Use headphones so Fish Audio output does not echo into your microphone. Record screen and microphone on separate tracks when possible.

Speak conversationally. Pause after the opening question and while the scene changes. Do not read every slide label aloud. Slow cursor movement makes the demo easier to follow.

## Demo later, not fabricated now
Slide 3 is explicitly a recording plan. Replace it in the final edit with actual app footage once the app is ready. Prepare the Park scenario and a sentence-level difficulty. Verify the objective and selected mode before recording.

1. Show the objective: a cat in the park.
2. Type `こうえんに ねこが います。` (Kōen ni neko ga imasu.)
3. Keep input, feedback, and actual response visible together. Let the viewer see the change.
4. At the dog objective, try `I like pizza`. Confirm the app rejects it without a new steering command.
5. Correct it with `いぬが ねこの となりに います。` (Inu ga neko no tonari ni imasu.)
6. Show what actually happens in the same running session. Do not claim perfect continuity unless the footage demonstrates it.
7. Stop/disconnect the session after recording to avoid wasting credits.

Do not describe rejection as “the video stops”: existing motion can continue. Do not cut away between submission and response in a way that implies an unmeasured instant result. Label sped-up footage. Keep a continuous unedited proof take as backup.

## Stack and claim checks
The user confirmed Groq fast inference as the intended/current presentation stack. Earlier inspected source still used OpenRouter, so verify the final deployed Groq integration and model before publishing. The deck intentionally does not name an unverified Groq model or latency figure.

Main layers: Next.js 16, React 19, TypeScript, Visko Orbis, Reactor SDK, WebRTC, Groq inference, Fish Audio, browser Web Speech API, React state, localStorage. fal.ai scripts generate supporting artwork, not the live world. Earlier Gemini prompt/image utilities are not presented as the main grading path. No database or authentication is claimed. Hosting is not claimed until deployed.

Fixed scenario grading has a keyword fallback in inspected code. That does not make Orbis, voice, free-form grading, or the whole app available offline. Narration describes scene text, not verified video frames. Guided answers unlock predefined scene additions. Free-form generation must be tested separately.

Before submission: test the final stack, real scene changes, audio, microphone permissions, and public links. Add only verified app/repository links on the closing shot. Confirm challenge duration and submission rules. No learning outcome, user count, latency benchmark, or winning guarantee is claimed.


## Six-slide visual upgrade

Two custom illustrations generated through fal using `openai/gpt-image-2.5/sunburst/text-to-image`, high quality. Assets are saved under `assets/` with provenance metadata. The API key is not stored in the deck, scripts, or asset metadata. Existing project logos for Next.js, Groq, Visko, Reactor, Fish Audio, and fal are embedded. Supporting framework/browser technologies are labeled in text, not represented by invented brand marks.

Open `yume-slides.pdf` for the exported six-page deck, or `preview-all-slides.jpg` for a contact sheet. The HTML supports presenter notes and keyboard navigation.

Validated in headless Edge: all six slides visually inspected, one slide visible at a time, no slide-boundary clipping at 1600x1000, 1366x768, 1920x1080, and 390x844. Previous/next, keyboard navigation, notes, and clean recording view pass. Mobile fits the whole slide, but recording is best on desktop.
