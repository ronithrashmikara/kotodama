# Yume · Six-slide recording script

Target: about 3 minutes 30 seconds including demo pauses. Confirm the challenge video limit before submitting.

Slide 2 is the screen-recording slot — replace its left panel with real footage (one correct turn, one wrong answer where the world stays still, one recovery). Everything else can be recorded to camera. Only describe what is actually visible on screen.

## 1. What if your words could change a world?

**Time: 00:00–00:25**

What if your words could change a world? I am Ronit, and this is Yume — a Japanese-learning game where the only way to change what you are looking at is to say it in Japanese. Yume means dream. The name comes from kotodama, the old idea that words carry the power to shape reality. I wanted to build the version of that you can actually play.

**Recording direction:** Look at the camera for the opening question, then let the artwork breathe for a beat. This is concept art, not a screenshot — the real product appears on slide 2.

## 2. Say it, and the world answers.

**Time: 00:25–01:15**

Here is one turn. The world speaks first — it describes itself in Japanese, out loud, at whatever level I have chosen. Every word on screen is tappable for its reading and meaning, and double-clicking one saves it. Then it is my turn. I say there is a cat in the park, and because the meaning lands, the live video steers to match. If my meaning does not land, nothing moves — the video itself is the feedback. Words I save come back later on a spaced repetition schedule, so this is not only a demo of video generation. It is actually a way to learn.

**Recording direction:** RECORD LATER. Replace the left panel with real footage: one correct turn, one deliberately wrong answer showing the world stay still, then a recovery. Leave about 20 seconds. Say only what is visible on screen.

## 3. The world does not wait for you.

**Time: 01:15–01:55**

This is the part I care about most. The world does not sit still waiting for me to type. Every twenty-two seconds it changes on its own — the light shifts, petals lift, the cat wanders off. And every third beat, it asks something of me. The lantern is drifting toward the pond, call out to it. If I say nothing, the story simply carries on without me. That is why this needs a live model rather than a library of clips. A clip cannot react to a sentence nobody has said yet, and it cannot keep going while you hesitate.

**Recording direction:** If you have footage of an ambient change happening with no input at all, cut to it here — it is the most convincing shot in the whole video. Do not claim the world reacts instantly; say within seconds.

## 4. And someone is walking with you.

**Time: 01:55–02:35**

There is also a companion mode. Her name is Hina. She is not a scripted character — a fast inference model writes what she says in about a second and a half, Fish Audio speaks it, and crucially her reply is what steers the video. So when I tell her the cat is cute and she agrees and calls it over, the cat actually comes over. She is bilingual, so a beginner is never stranded: speak English to her and she answers warmly, then hands back the Japanese you were reaching for. And every word she says is tappable and saveable, exactly like the narration.

**Recording direction:** If Hina is on screen, check she stays visually consistent — the app conditions Orbis on a fixed reference frame for exactly this reason. Do not claim she remembers you between sessions; she does not yet.

## 5. Language in. A live world out.

**Time: 02:35–03:05**

Under the hood it is deliberately small. I speak Japanese — the microphone is always open, so there is nothing to press. That goes to Groq, running GPT-OSS 120B, which decides whether the meaning landed, writes Hina’s reply, and drifts the world. It comes back in about a second and a half, and that speed genuinely matters, because this sits between me talking and the world reacting. Then the Reactor SDK sends set_prompt to Visko Orbis over WebRTC, and that steers the scene already running rather than generating a new clip. Fish Audio gives everything a voice, the app itself is Next.js and React, and fal made the artwork — including these slides. Then the changed world narrates itself back to me, and the loop starts again.

**Recording direction:** This is the slide judges will pause on. Point at each box as you name it. Do not overstate the model — say GPT-OSS 120B on Groq, and only quote latency you have actually measured.

## 6. Don’t just learn a word. Give it a world.

**Time: 03:05–03:30**

So that is Yume. Live steering across five worlds, four difficulty levels, narration you can tap word by word, a companion who talks back, and a review system so the words you meet actually stick. What I want next is interruption — being able to talk over her the way you would with a real person — and silence that she fills when you hesitate. And then the honest next step: putting this in front of real learners and finding out whether they come back. Don’t just learn a word. Give it a world. Thank you.

**Recording direction:** Look back at the camera. Add the live app link and the repository link in your final edit. Do not claim learner validation you have not done.
