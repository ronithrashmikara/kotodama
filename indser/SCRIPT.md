# Yume · Six-slide recording script

Target: approximately 3 minutes 15 seconds, including real demo pauses. Confirm the challenge duration before submission. Visual style is inspired by sampled frames from the supplied reference. Groq is the user-confirmed provider. Demo recording is deferred until the app is ready.

## 1. What if your words could change a world?

**Time: 00:00–00:25**

What if your words could change a world? I’m Ronit, and this is Yume, a Japanese-learning game built around a simple idea: when your meaning is understood, the world responds. Yume means dream. I wanted to turn language practice into a place you can shape, not just a question you can answer.

**Recording direction:** Start looking at the camera. This is concept artwork, not a product screenshot. Transition to the motivation, then the real demo on slide 3.

## 2. Less guessing. More expressing.

**Time: 00:25–00:50**

Recognizing an answer and expressing an idea are different experiences. I wanted practice where Japanese does something, rather than only earning a check mark. Yume takes inspiration from kotodama, the idea that words can shape reality. The product turns that metaphor into a small, repeatable interaction.

**Recording direction:** This is a product-design motivation, not a fabricated personal learning history. Tell a true personal example instead if you have one.

## 3. Your Japanese is the next move.

**Time: 00:50–01:45**

Here is the loop. The objective asks for a cat in the park. I type, “こうえんに ねこが います.” It means, “There is a cat in the park.” Yume checks the meaning and sends the accepted scene change to Orbis. Now I try an unrelated answer at the next objective. I get feedback, without a new steering command. Then I correct it: “いぬが ねこの となりに います.” A dog is next to the cat. The next change goes into the same running session. The prototype also includes three guided worlds, four difficulty levels, narration, and vocabulary saving.

**Recording direction:** RECORD LATER. Allow 15–20 seconds within this section for real responses. Show one uninterrupted correct turn, an incorrect English answer such as “I like pizza,” then the corrected dog turn. Use sentence-level difficulty. Only describe results visible in the recording. Do not claim rejection freezes the existing video. Mic input is optional, text is the reliable recording path.

## 4. Language becomes a control signal.

**Time: 01:45–02:30**

The app uses Next.js, React, and TypeScript. A server route sends the learner’s answer to Groq for language-model inference. In guided mode, an accepted answer unlocks a predefined scene addition. The app updates the running scene prompt, and the Reactor SDK sends set_prompt to steer Visko Orbis over the live connection. Fish Audio provides Japanese speech, browser speech recognition supports microphone input, and local storage keeps saved vocabulary. fal provides supporting artwork, including these presentation illustrations. It is not the live-video engine.

**Recording direction:** User-confirmed provider: Groq. Verify the final deployed Groq model before publishing. Do not invent a model name or measured speedup. Narration uses scene text, not visual frame analysis. Fixed-scenario keyword fallback does not make the whole app offline. Brand logos are local project assets, not generated imitations.

## 5. The video is not decoration. It is the response.

**Time: 02:30–02:55**

Orbis matters because the learner keeps interacting with an already-running world. A fixed clip cannot respond to a new answer. Yume uses live steering as part of the learning mechanic: input, interpretation, consequence, and another attempt. That is the distinction I want this prototype to demonstrate, rather than just showing an attractive generated video.

**Recording direction:** Show actual consecutive turns if footage is available. Do not promise perfect persistence, instant response, or objectively improved learning without evidence.

## 6. Don’t just learn the word. Give it a world.

**Time: 02:55–03:15**

The next step is to validate the live loop reliably and test the experience with learners. I want to understand whether people can express the intended meaning, recover from mistakes, and want to try another turn. That is Yume: a dream you shape, one sentence at a time. Thank you.

**Recording direction:** Look back at the camera. Add verified public app and repository links in your final edit. Update future work after testing, but do not invent completed validation or user results.
