// Slide copy for the Yume deck, kept separate from build-deck.mjs so the words
// can be edited without touching the generator.
export function buildSlides({ image, logo }) {
  return [
    {
      tag: "01 / THE IDEA",
      title: "What if your words<br>could change a world?",
      sub: "Yume 夢 · a Japanese-learning game built on a live video model",
      time: "00:00–00:25",
      body: `<div class="ys-split"><div class="ys-hero-copy"><p class="ys-hand ys-motto">Speak Japanese.<br>Watch meaning become visible.</p><p class="ys-small">Textbooks ask you to recognise. Yume asks you to express — then shows you what your words did.</p><div class="ys-brand-row">${logo("visko", "Visko")}${logo("reactor", "Reactor")}<span>Live world powered by Visko Orbis</span></div></div><figure class="ys-art ys-art-460"><img src="${image("hero-dream")}" alt="Illustrated Japanese dream landscape at golden hour"><figcaption>Concept artwork · GPT Image 2.5 Sunburst on fal · not gameplay</figcaption></figure></div>`,
      say: "What if your words could change a world? I am Ronit, and this is Yume — a Japanese-learning game where the only way to change what you are looking at is to say it in Japanese. Yume means dream. The name comes from kotodama, the old idea that words carry the power to shape reality. I wanted to build the version of that you can actually play.",
      cue: "Look at the camera for the opening question, then let the artwork breathe for a beat. This is concept art, not a screenshot — the real product appears on slide 2.",
    },
    {
      tag: "02 / THE LOOP",
      title: "Say it, and the<br>world answers.",
      sub: "One turn: an objective, your Japanese, and a change in the running video.",
      time: "00:25–01:15",
      body: `<div class="ys-split-wide"><div class="ys-demo-board"><span class="ys-label">PARK · LEVEL: SENTENCE</span><h3>Tell the world there is a cat in the park.</h3><p class="ys-jp-line">こうえんに ねこが います。</p><p>There is a cat in the park.</p><div class="ys-demo-path"><span>Meaning understood</span><b>&rarr;</b><span>Orbis steers</span></div><div class="ys-record-note">Screen recording goes here — one correct turn, one wrong answer, one recovery.</div></div><div><ul class="ys-beats"><li><span class="n">1</span><div><b>It narrates to you first</b><p>The world describes itself in Japanese, aloud, pitched at your level.</p></div></li><li><span class="n">2</span><div><b>Every word is tappable</b><p>Hover for reading and meaning. Double-click to keep it.</p></div></li><li><span class="n">3</span><div><b>You answer, it moves</b><p>Understood meaning steers the live scene. Wrong meaning changes nothing.</p></div></li><li><span class="n">4</span><div><b>Saved words come back</b><p>Spaced repetition — 1, 2, 4, 8, 16 days.</p></div></li></ul><div class="ys-chips"><span class="ys-chip on">ひとこと single word</span><span class="ys-chip">フレーズ phrase</span><span class="ys-chip">ぶん sentence</span><span class="ys-chip">びょうしゃ description</span></div></div></div>`,
      say: "Here is one turn. The world speaks first — it describes itself in Japanese, out loud, at whatever level I have chosen. Every word on screen is tappable for its reading and meaning, and double-clicking one saves it. Then it is my turn. I say there is a cat in the park, and because the meaning lands, the live video steers to match. If my meaning does not land, nothing moves — the video itself is the feedback. Words I save come back later on a spaced repetition schedule, so this is not only a demo of video generation. It is actually a way to learn.",
      cue: "RECORD LATER. Replace the left panel with real footage: one correct turn, one deliberately wrong answer showing the world stay still, then a recovery. Leave about 20 seconds. Say only what is visible on screen.",
    },
    {
      tag: "03 / WHY LIVE VIDEO",
      title: "The world does not<br>wait for you.",
      sub: "It keeps moving on its own — the one thing a pre-rendered clip can never do.",
      time: "01:15–01:55",
      body: `<div class="ys-split"><div><p class="ys-hand" style="font-size:27px;line-height:1.55;margin:0 0 22px">Every 22 seconds the scene<br>changes by itself.</p><ul class="ys-beats"><li><span class="n">&#9702;</span><div><b>Ambient drift</b><p>Light shifts, petals lift, the cat wanders off.</p></div></li><li><span class="n">!</span><div><b>Then it asks something of you</b><p>“The lantern is drifting toward the pond — call out to it.” Say nothing and the story carries on without you.</p></div></li></ul><p class="ys-small" style="margin-top:20px">You are not the only thing happening. That is what makes real time load-bearing here rather than decorative.</p></div><figure class="ys-art ys-art-420"><img src="${image("living-world")}" alt="One park scene showing afternoon, dusk and rain at once"><figcaption>Concept artwork · GPT Image 2.5 Sunburst on fal · not gameplay</figcaption></figure></div>`,
      say: "This is the part I care about most. The world does not sit still waiting for me to type. Every twenty-two seconds it changes on its own — the light shifts, petals lift, the cat wanders off. And every third beat, it asks something of me. The lantern is drifting toward the pond, call out to it. If I say nothing, the story simply carries on without me. That is why this needs a live model rather than a library of clips. A clip cannot react to a sentence nobody has said yet, and it cannot keep going while you hesitate.",
      cue: "If you have footage of an ambient change happening with no input at all, cut to it here — it is the most convincing shot in the whole video. Do not claim the world reacts instantly; say within seconds.",
    },
    {
      tag: "04 / THE COMPANION",
      title: "And someone is<br>walking with you.",
      sub: "Hina — fast inference is her brain, Fish Audio is her voice, and she moves the world herself.",
      time: "01:55–02:35",
      body: `<div class="ys-split"><figure class="ys-art ys-art-420"><img src="${image("companion-walk")}" alt="Two friends walking a blossom path in evening light"><figcaption>Concept artwork · GPT Image 2.5 Sunburst on fal · not gameplay</figcaption></figure><div><p class="ys-hand" style="font-size:26px;line-height:1.5;margin:0 0 18px">Talk to her. She answers<br>— and the scene follows.</p><div class="ys-chatbox"><p class="ys-who">YOU</p><p class="ys-jp-line ys-chat-jp">ねこが かわいいですね</p><p class="ys-who">HINA</p><p class="ys-jp-line ys-chat-jp">うん、すごくかわいいね！</p><p class="ys-chat-en">“Yeah, it’s really cute!”</p><p class="ys-chat-effect">&rarr; the cat trots over and settles beside you</p></div><p class="ys-small">Bilingual, so a beginner is never stranded. Speak English and she answers warmly, then hands back the Japanese you were reaching for.</p></div></div>`,
      say: "There is also a companion mode. Her name is Hina. She is not a scripted character — a fast inference model writes what she says in about a second and a half, Fish Audio speaks it, and crucially her reply is what steers the video. So when I tell her the cat is cute and she agrees and calls it over, the cat actually comes over. She is bilingual, so a beginner is never stranded: speak English to her and she answers warmly, then hands back the Japanese you were reaching for. And every word she says is tappable and saveable, exactly like the narration.",
      cue: "If Hina is on screen, check she stays visually consistent — the app conditions Orbis on a fixed reference frame for exactly this reason. Do not claim she remembers you between sessions; she does not yet.",
    },
    {
      tag: "05 / HOW IT IS BUILT",
      title: "Language in.<br>A live world out.",
      sub: "Speech becomes a control signal. Each layer has exactly one job.",
      time: "02:35–03:05",
      body: `<div class="ys-arch"><div class="ys-node"><span class="ys-label">YOU SAY IT</span><b>Japanese</b><p>Always-on speech recognition, or typed. Nothing to press.</p></div><div class="ys-link">&rarr;<small>MEANING</small></div><div class="ys-node mid">${logo("groq", "Groq")}<b>Understand</b><p>GPT-OSS 120B. Grades meaning, writes Hina’s reply, drifts the world. About 1.4s.</p></div><div class="ys-link">&rarr;<small>set_prompt</small></div><div class="ys-node out">${logo("reactor", "Reactor")}<b>Steer the world</b><p>Visko Orbis over WebRTC. The running scene changes — not a new clip.</p></div></div><div class="ys-arch-foot"><div>${logo("fish-audio", "Fish Audio")}<div><b>Voice</b><p>Narration and Hina, spoken in Japanese and English.</p></div></div><div>${logo("nextjs", "Next.js")}<div><b>App</b><p>Next.js 16, React 19, TypeScript. Saved words live in the browser.</p></div></div><div>${logo("fal", "fal")}<div><b>Artwork</b><p>Backgrounds, icons, and these slides. Not the live-video engine.</p></div></div></div><p class="ys-loop-back">&#8634; the changed world narrates itself back to you in Japanese — and the loop starts again</p>`,
      say: "Under the hood it is deliberately small. I speak Japanese — the microphone is always open, so there is nothing to press. That goes to Groq, running GPT-OSS 120B, which decides whether the meaning landed, writes Hina’s reply, and drifts the world. It comes back in about a second and a half, and that speed genuinely matters, because this sits between me talking and the world reacting. Then the Reactor SDK sends set_prompt to Visko Orbis over WebRTC, and that steers the scene already running rather than generating a new clip. Fish Audio gives everything a voice, the app itself is Next.js and React, and fal made the artwork — including these slides. Then the changed world narrates itself back to me, and the loop starts again.",
      cue: "This is the slide judges will pause on. Point at each box as you name it. Do not overstate the model — say GPT-OSS 120B on Groq, and only quote latency you have actually measured.",
    },
    {
      tag: "06 / YUME 夢",
      title: "Don’t just learn a word.<br>Give it a world.",
      sub: "Speak Japanese. Watch your words become reality.",
      time: "03:05–03:30",
      body: `<div class="ys-split"><div class="ys-closing-copy"><p class="ys-hand">A dream you shape,<br>one sentence at a time.</p><div class="ys-close-grid"><div><h4>WORKING TODAY</h4><p>Live steering · 5 worlds</p><p>4 levels · spoken narration</p><p>Hina · spaced repetition</p></div><div><h4>NEXT TO PROVE</h4><p>Interrupting her mid-sentence</p><p>Silence she fills herself</p><p>Testing with real learners</p></div></div><p class="ys-small ys-sig">Ronit Rashmikara · Visko Orbis Challenge</p></div><figure class="ys-art ys-art-460"><img src="${image("hero-dream")}" alt="Illustrated Japanese dream landscape at golden hour"><figcaption>Concept artwork · GPT Image 2.5 Sunburst on fal · not gameplay</figcaption></figure></div>`,
      say: "So that is Yume. Live steering across five worlds, four difficulty levels, narration you can tap word by word, a companion who talks back, and a review system so the words you meet actually stick. What I want next is interruption — being able to talk over her the way you would with a real person — and silence that she fills when you hesitate. And then the honest next step: putting this in front of real learners and finding out whether they come back. Don’t just learn a word. Give it a world. Thank you.",
      cue: "Look back at the camera. Add the live app link and the repository link in your final edit. Do not claim learner validation you have not done.",
    },
  ];
}
