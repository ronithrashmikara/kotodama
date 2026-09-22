# Yume · Short six-slide script

Target: roughly 2 minutes plus actual demo response time. Confirm submission limits. The full version in SCRIPT.md includes more technical detail. Bracketed directions are not spoken.

## 1 · The idea · 0:00–0:15
What if your words could change a world? I’m Ronit, and this is Yume: a Japanese-learning game where being understood becomes something you can see. Yume means dream, and this is a dream you shape with language.

## 2 · Why I built it · 0:15–0:30
Recognizing an answer is different from expressing an idea. I wanted Japanese practice where words do something, rather than only earn a check mark. That is the idea behind Yume.

## 3 · Demo · 0:30–1:10
The objective is to put a cat in the park. I type, “こうえんに ねこが います。” There is a cat in the park. Yume checks the meaning and sends the accepted change to Orbis.

[Pause for the real visible response. Show an unrelated English answer at the next objective, then the correction.]

A wrong answer gets feedback, without a new steering command. Then I correct it: “いぬが ねこの となりに います。” A dog is next to the cat. The next change goes into the same running session.

## 4 · Stack · 1:10–1:40
Next.js, React, and TypeScript power the app. Groq provides language-model inference for grading and scene-text narration. Reactor connects to Visko Orbis and sends prompt updates to steer the live world. Fish Audio provides Japanese speech, browser speech recognition supports voice input, and local storage saves vocabulary. fal provides the supporting artwork, not the live video.

## 5 · Why Orbis · 1:40–1:55
The video is not decoration. It is the response. The learner keeps expressing changes while the world is already running, instead of watching fixed clips.

## 6 · Close · 1:55–2:10
Next, I want to prove the loop reliably and test it with learners. That is Yume. Don’t just learn the word. Give it a world. Thank you.

[Add only verified app and repository links in the final recording. Do not claim untested performance, learning outcomes, or perfect visual continuity.]
