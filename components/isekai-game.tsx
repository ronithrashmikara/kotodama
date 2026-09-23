"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Narration as NarrationData, NarrationToken } from "@/app/api/narrate/route";
import { Narration } from "@/components/narration";
import { OrbisPlayer } from "@/components/orbis-player";
import { VocabPanel } from "@/components/vocab-panel";
import { VocabReview } from "@/components/vocab-review";
import { useOrbisSession, type OrbisSession } from "@/hooks/use-orbis-session";
import {
  FIRST_FREE_LEVEL_ID,
  getLevel,
  LEVELS,
  loadRung,
  nextRung,
  saveRung,
} from "@/lib/levels";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import {
  buildChoiceScenario,
  buildFreeformScenario,
  localCheck,
  SCENARIOS,
  type Scenario,
} from "@/lib/scenarios";
import { ChoiceCards } from "@/components/choice-cards";
import { EchoCard } from "@/components/echo-card";
import { FillCard } from "@/components/fill-card";
import type { Choice } from "@/app/api/choices/route";
import type { EchoWord } from "@/app/api/word/route";
import type { FillFrame, FillOption } from "@/app/api/fill/route";
import { matchesEcho } from "@/lib/romaji";
import { addEvent, composeScene, type SceneEvent } from "@/lib/scene";
import {
  buildCompanionScenario,
  COMPANION_IMAGE,
  COMPANION_NAME,
  withCompanion,
} from "@/lib/companion";
import type { CompanionReply } from "@/app/api/companion/route";
import { loadVocab, removeWord, saveWord, type VocabEntry } from "@/lib/vocab";

type CheckResponse = {
  correct: boolean;
  feedback: string;
  correctedJapanese: string;
  sceneAddEn?: string;
  method?: string;
};

export function IsekaiGame({ children }: { children?: ReactNode }) {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <ReactorProvider
      apiUrl="https://api.reactor.inc"
      modelName={ORBIS_MODEL_NAME}
      modelTracks={[...ORBIS_TRACKS]}
      connectOptions={{ autoConnect: false }}
      jwtToken={getJwt}
    >
      <IsekaiSession clearJwt={clearJwt} getCurrentJwt={getCurrentJwt}>
        {children}
      </IsekaiSession>
    </ReactorProvider>
  );
}

type Phase = "pick" | "connecting" | "starting" | "playing" | "complete";

function IsekaiSession({
  clearJwt,
  getCurrentJwt,
  children,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
  children?: ReactNode;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);

  const [phase, setPhase] = useState<Phase>("pick");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  // Everything that has happened, in order. composeScene() turns it into the
  // Orbis prompt; the completion screen replays it as the story you told.
  const [sceneEvents, setSceneEvents] = useState<SceneEvent[]>([]);
  const [worldAlive, setWorldAlive] = useState(true);
  const [worldEvent, setWorldEvent] = useState<{ text: string; urgent: boolean } | null>(null);
  const runningScene = scenario ? composeScene(scenario.basePrompt, sceneEvents) : "";
  const [conversation, setConversation] = useState<{ role: "you" | "companion"; text: string }[]>([]);
  const [companionLine, setCompanionLine] = useState<CompanionReply | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [turns, setTurns] = useState(0);
  const [correctTurns, setCorrectTurns] = useState(0);

  const [levelId, setLevelId] = useState(FIRST_FREE_LEVEL_ID);
  // Beginner rungs: one word to echo, or a sentence frame to complete.
  const [echoWord, setEchoWord] = useState<EchoWord | null>(null);
  const [echoState, setEchoState] = useState<"waiting" | "ok" | "retry">("waiting");
  const [taught, setTaught] = useState<string[]>([]);
  const [fillFrame, setFillFrame] = useState<FillFrame | null>(null);
  // Outcomes of recent turns, most recent last. Drives silent auto-levelling.
  const [rungHistory, setRungHistory] = useState<boolean[]>([]);
  const [narration, setNarration] = useState<NarrationData | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const level = getLevel(levelId);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setVocab(loadVocab()), []);
  // Where they got to last time. Read after mount so the server render and the
  // first client render agree.
  useEffect(() => setLevelId(loadRung()), []);

  // One narrator at a time — a new line cuts off whatever is still playing.
  // Plays lines back to back, so Hina can say something in Japanese and then
  // echo it in English without the second line cutting off the first.
  const speakSequence = useCallback((lines: string[]) => {
    const queue = lines.map((l) => l.trim()).filter(Boolean);
    if (!queue.length) return;

    audioRef.current?.pause();
    setSpeaking(true);

    let index = 0;
    const playNext = () => {
      if (index >= queue.length) {
        setSpeaking(false);
        return;
      }
      try {
        const audio = new Audio(`/api/tts?text=${encodeURIComponent(queue[index++])}`);
        audioRef.current = audio;
        audio.onended = playNext;
        // A failed line shouldn't strand the rest of the queue.
        audio.onerror = playNext;
        void audio.play().catch(playNext);
      } catch {
        playNext();
      }
    };
    playNext();
  }, []);

  const speak = useCallback((text: string) => speakSequence([text]), [speakSequence]);

  const narrateScene = useCallback(
    async (scene: string) => {
      if (!scene.trim()) return;
      setNarrating(true);
      try {
        const res = await fetch("/api/narrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene, level: levelId }),
        });
        if (!res.ok) {
          setNarration(null);
          return;
        }
        const data: NarrationData = await res.json();
        setNarration(data);
        speak(data.japanese);
      } catch {
        setNarration(null);
      } finally {
        setNarrating(false);
      }
    },
    [levelId, speak],
  );

  // Rung 0: fetch one visible thing from the scene and teach its word.
  const offerEcho = useCallback(async (scene: string) => {
    if (!scene.trim()) return;
    setChoosing(true);
    setEchoState("waiting");
    try {
      const res = await fetch("/api/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, taught: taughtRef.current }),
      });
      if (!res.ok) {
        setEchoWord(null);
        return;
      }
      const word: EchoWord = await res.json();
      setEchoWord(word);
      setTaught((t) => [...t, word.kana]);
      // Hear it before being asked to say it.
      speak(word.kana);
    } catch {
      setEchoWord(null);
    } finally {
      setChoosing(false);
    }
  }, [speak]);

  // Rung 2: a sentence frame with one gap and three ways to fill it.
  const offerFill = useCallback(async (scene: string) => {
    if (!scene.trim()) return;
    setChoosing(true);
    try {
      const res = await fetch("/api/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene,
          recent: sceneEventsRef.current.filter((e) => e.source === "you").slice(-3).map((e) => e.text),
        }),
      });
      setFillFrame(res.ok ? await res.json() : null);
    } catch {
      setFillFrame(null);
    } finally {
      setChoosing(false);
    }
  }, []);

  // Choice mode: fetch two kana-only options for whatever the scene is now.
  const offerChoices = useCallback(
    async (scene: string) => {
      if (!scene.trim()) return;
      setChoosing(true);
      try {
        const res = await fetch("/api/choices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene,
            recent: sceneEventsRef.current.filter((e) => e.source === "you").slice(-3).map((e) => e.text),
          }),
        });
        if (!res.ok) {
          setChoices(null);
          return;
        }
        const data: { choices: Choice[] } = await res.json();
        setChoices(data.choices ?? null);
      } catch {
        setChoices(null);
      } finally {
        setChoosing(false);
      }
    },
    [],
  );


  // The world keeps moving whether or not you act. This is what makes a live
  // model load-bearing rather than decorative — and it's effectively free,
  // since Orbis bills for the seconds you're already holding regardless of
  // whether the scene changes.
  const driftBusy = useRef(false);
  const driftCount = useRef(0);
  // The interval closes over state once, so read events through a ref.
  const sceneEventsRef = useRef<SceneEvent[]>([]);
  sceneEventsRef.current = sceneEvents;
  // Read inside callbacks that must not be rebuilt every time a word is taught.
  const taughtRef = useRef<string[]>([]);
  taughtRef.current = taught;

  useEffect(() => {
    if (phase !== "playing" || !worldAlive || !scenario) return;

    const id = setInterval(async () => {
      // Never talk over the player's turn or a steer already in flight.
      if (driftBusy.current || checking || pendingSteer.current !== null) return;
      driftBusy.current = true;
      try {
        driftCount.current += 1;
        // Every third beat asks something of the player instead of just drifting.
        const stakes = driftCount.current % 3 === 0;
        const res = await fetch("/api/drift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene: composeScene(scenario.basePrompt, sceneEventsRef.current),
            recent: sceneEventsRef.current
              .filter((e) => e.source === "world")
              .slice(-3)
              .map((e) => e.text),
            stakes,
          }),
        });
        if (!res.ok) return;
        const drift: { sceneAddEn: string; event: string; urgent?: boolean } = await res.json();
        if (!drift.sceneAddEn) return;

        const next = addEvent(sceneEventsRef.current, { text: drift.sceneAddEn, source: "world" });
        setSceneEvents(next);
        setWorldEvent({ text: drift.event, urgent: Boolean(drift.urgent) });
        const nextScene = composeScene(scenario.basePrompt, next);
        pendingSteer.current = nextScene;
        session.setPrompt(nextScene);
        void narrateScene(nextScene);
      } catch {
        // A missed beat is harmless; the next tick tries again.
      } finally {
        driftBusy.current = false;
      }
    }, 22_000);

    return () => clearInterval(id);
  }, [phase, worldAlive, scenario, checking, session, narrateScene]);

  const handleSaveWord = (token: NarrationToken) => {
    setVocab(saveWord({ surface: token.surface, reading: token.reading, meaning: token.meaning }));
  };

  const handleRemoveWord = (surface: string) => setVocab(removeWord(surface));

  const savedSurfaces = new Set(vocab.map((v) => v.surface));

  const pendingStart = useRef<string | null>(null);
  const pendingSteer = useRef<string | null>(null);

  // Fires session.startRun() once session.prompt catches up to a pending
  // "begin the world" request — set_prompt is async React state, so we wait
  // for the round trip instead of racing it.
  useEffect(() => {
    if (pendingStart.current !== null && session.prompt === pendingStart.current) {
      pendingStart.current = null;
      setPhase("starting");
      void session.startRun();
    }
  }, [session.prompt, session]);

  useEffect(() => {
    if (pendingSteer.current !== null && session.prompt === pendingSteer.current) {
      pendingSteer.current = null;
      void session.steer();
    }
  }, [session.prompt, session]);

  // What this rung asks for this turn. Below "free" the world is open-ended
  // even in a scripted world: a beginner cannot hit a scripted objective, and
  // gating the world behind competence is exactly what this ladder exists to
  // avoid.
  const modeRef = useRef(level.mode);
  modeRef.current = level.mode;

  const nextTurn = useCallback(
    (scene: string) => {
      switch (modeRef.current) {
        case "echo":
          return void offerEcho(scene);
        case "choose":
          return void offerChoices(scene);
        case "fill":
          return void offerFill(scene);
        default:
          return;
      }
    },
    [offerEcho, offerChoices, offerFill],
  );

  useEffect(() => {
    if (phase === "starting" && session.runStarted) {
      setPhase("playing");
      void narrateScene(runningScene);
      nextTurn(runningScene);
    }
  }, [phase, session.runStarted, narrateScene, runningScene, nextTurn]);

  /**
   * Record how a turn went and move the rung if the pattern is clear.
   * Deliberately silent: the player should notice Hina speaking more Japanese,
   * not a number going up.
   */
  const recordTurn = useCallback(
    (ok: boolean) => {
      setRungHistory((history) => {
        const next = [...history, ok].slice(-6);
        setLevelId((current) => {
          const moved = nextRung(current, next);
          if (moved !== current) {
            saveRung(moved);
            // Fresh slate after a move, or the same four turns would move it again.
            queueMicrotask(() => setRungHistory([]));
          }
          return moved;
        });
        return next;
      });
    },
    [],
  );

  const enterScenario = async (chosen: Scenario) => {
    setScenario(chosen);
    setStepIndex(0);
    setSceneEvents([]);
    setWorldEvent(null);
    setFeedback(null);
    setStreak(0);
    setTurns(0);
    setCorrectTurns(0);
    setConversation([]);
    setCompanionLine(null);
    setChoices(null);
    setEchoWord(null);
    setFillFrame(null);
    setTaught([]);
    setRungHistory([]);
    // The かな card is the choose rung by name, so picking it means that rung
    // however far up the ladder you had climbed.
    if (chosen.id === "choices") setLevelId(1);
    setPhase("connecting");

    // Condition Orbis on Hina's reference frame so she starts as the same
    // person every session. The locked text description in the prompt is what
    // keeps her that way once set_prompt starts moving the scene.
    if (chosen.id === "companion") {
      try {
        const blob = await (await fetch(COMPANION_IMAGE)).blob();
        session.selectImage(new File([blob], "companion.jpg", { type: "image/jpeg" }));
      } catch {
        // Losing the anchor costs consistency, not the session — carry on.
      }
    } else {
      session.selectImage(null);
    }

    if (!session.connected) {
      const ok = await session.connectSession();
      if (!ok) {
        setPhase("pick");
        return;
      }
    }

    pendingStart.current = chosen.basePrompt;
    session.setPrompt(chosen.basePrompt);
  };

  const leaveWorld = async () => {
    await session.disconnectSession();
    setPhase("pick");
    setScenario(null);
  };

  const isFreeform = scenario?.id === "freeform";
  const isCompanion = scenario?.id === "companion";
  const step = scenario ? scenario.steps[stepIndex] : null;

  /** Steer the world and queue the next turn. Shared by every beginner rung. */
  const applyTurn = (sceneAddEn: string, said: string) => {
    if (!scenario) return;
    const next = addEvent(sceneEvents, { text: sceneAddEn, source: "you", said });
    setSceneEvents(next);
    setWorldEvent(null);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);

    const nextScene = composeScene(scenario.basePrompt, next);
    pendingSteer.current = nextScene;
    session.setPrompt(nextScene);
    // Let the steer land before asking what could happen after it.
    setTimeout(() => nextTurn(nextScene), 1200);
  };

  /**
   * Rung 0. Graded on the client against the kana and its romanisation, with
   * no network call: this is the first Japanese a beginner ever speaks, and a
   * second of latency at that exact moment is the difference between "the
   * world answered me" and "I submitted a form".
   */
  const sayEcho = (said: string) => {
    if (!echoWord || checking) return;
    const { ok } = matchesEcho(said, echoWord.kana, echoWord.romaji, echoWord.accept);
    if (!ok) {
      setEchoState("retry");
      recordTurn(false);
      // Say it again for them — hearing the target right after their own
      // attempt is the most useful correction there is.
      speak(echoWord.kana);
      return;
    }

    setEchoState("ok");
    recordTurn(true);
    setStreak((s) => s + 1);
    setVocab(saveWord({ surface: echoWord.kana, reading: echoWord.kana, meaning: echoWord.english }));
    const word = echoWord;
    setTimeout(() => {
      setEchoWord(null);
      applyTurn(word.sceneAddEn, word.kana);
    }, 700);
  };

  /** Rung 2. No option is wrong — whichever is picked is what happens. */
  const pickFill = (option: FillOption) => {
    if (!fillFrame || checking) return;
    const sentence = fillFrame.frameKana.replace("___", option.kana);
    setFillFrame(null);
    recordTurn(true);
    setStreak((s) => s + 1);
    setVocab(saveWord({ surface: option.kana, reading: option.kana, meaning: option.english }));
    speak(sentence);
    applyTurn(option.sceneAddEn, sentence);
  };

  const pickChoice = async (choice: Choice) => {
    if (!scenario || checking) return;
    setChecking(true);
    setChoices(null);
    try {
      recordTurn(true);
      setVocab(saveWord({ surface: choice.kana, reading: choice.kana, meaning: choice.english }));
      speak(choice.kana);
      applyTurn(choice.sceneAddEn, choice.kana);
    } finally {
      setChecking(false);
    }
  };

  // Companion mode is a conversation, not a graded turn: whatever you say goes
  // to Hina, she answers in Japanese, and her answer steers the world.
  const talkToCompanion = async () => {
    const said = answer.trim();
    if (!said || checking || !scenario) return;
    setChecking(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said, scene: runningScene, level: levelId, history: conversation }),
      });
      if (!res.ok) {
        setFeedback({ ok: false, text: `${COMPANION_NAME} didn't catch that — try again.` });
        return;
      }
      const data: CompanionReply = await res.json();

      setConversation((c) => [...c, { role: "you", text: said }, { role: "companion", text: data.reply }]);
      setCompanionLine(data);
      setAnswer("");
      setTurns((t) => t + 1);
      // Beginners hear the English echo too; past that it stays on screen only,
      // so the Japanese keeps carrying the turn.
      speakSequence(levelId <= 2 ? [data.reply, data.replyEn] : [data.reply]);

      if (data.sceneAddEn) {
        const next = addEvent(sceneEvents, { text: data.sceneAddEn, source: "companion", said });
        setSceneEvents(next);
        const nextScene = withCompanion(composeScene(scenario.basePrompt, next));
        pendingSteer.current = nextScene;
        session.setPrompt(nextScene);
      }
    } finally {
      setChecking(false);
    }
  };

  const submitAnswer = async () => {
    if (isCompanion) return talkToCompanion();
    if ((!isFreeform && !step) || !answer.trim() || checking) return;
    setChecking(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isFreeform
            ? { learnerText: answer, freeform: true, sceneContext: runningScene, level: levelId }
            : {
                learnerText: answer,
                objectiveEn: step!.objectiveEn,
                sampleAnswer: step!.sampleAnswer,
                requiredAll: step!.requiredAll,
                level: levelId,
              },
        ),
      });
      const data: CheckResponse = res.ok
        ? await res.json()
        : isFreeform
          ? { correct: false, feedback: "Something went wrong — try again.", correctedJapanese: "" }
          : {
              correct: localCheck(step!, answer).correct,
              feedback: "Offline check.",
              correctedJapanese: step!.sampleAnswer,
            };

      setTurns((t) => t + 1);
      setFeedback({ ok: data.correct, text: data.feedback });
      recordTurn(data.correct);

      if (data.correct) {
        setCorrectTurns((c) => c + 1);
        setStreak((s) => s + 1);
        const addition = isFreeform ? data.sceneAddEn : step!.sceneAdd;
        const nextEvents = addition
          ? addEvent(sceneEvents, { text: addition, source: "you", said: answer.trim() })
          : sceneEvents;
        const nextScene = scenario ? composeScene(scenario.basePrompt, nextEvents) : runningScene;
        setSceneEvents(nextEvents);
        setWorldEvent(null);
        pendingSteer.current = nextScene;
        session.setPrompt(nextScene);
        setAnswer("");

        // On success the narrator describing the changed world is the reward,
        // so it speaks instead of the correction — two voices would collide.
        void narrateScene(nextScene);

        if (!isFreeform) {
          if (scenario && stepIndex + 1 < scenario.steps.length) {
            setTimeout(() => setStepIndex((i) => i + 1), 900);
          } else {
            setTimeout(() => setPhase("complete"), 900);
          }
        }
      } else {
        setStreak(0);
        if (data.correctedJapanese) speak(data.correctedJapanese);
      }
    } finally {
      setChecking(false);
    }
  };

  // Orbis bills for every wall-clock second the GPU is held, and the token
  // caps a session at 300s — so the world would otherwise vanish mid-take with
  // no warning. This tracks elapsed time and turns amber as the cap nears.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session.runStarted) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [session.runStarted]);

  const statusLabel =
    session.status === "ready" ? "Live" : session.status === "connecting" ? "Connecting" : session.status;

  return (
    <div className="isekai">
      {phase === "pick" && (
        <>
          {/* A failed connect drops straight back here, and the HUD that
              normally shows session.error has just unmounted — so without
              this the world silently bounces you home with no reason given. */}
          {session.error && (
            <div className="connect-error">
              <strong>Could not open that world.</strong>
              <span>{session.error}</span>
            </div>
          )}
          <ScenarioPicker onPick={enterScenario} />
          {children}
        </>
      )}

      {phase !== "pick" && (
        <div className="isekai-play">
          <div className="isekai-video">
            <OrbisPlayer
              connected={session.connected}
              muted={session.muted}
              runStarted={session.runStarted}
              status={session.status}
            />
            {(phase === "connecting" || phase === "starting") && (
              <div className="isekai-loading">
                <span className="isekai-spinner" aria-hidden="true" />
                {phase === "connecting" ? "Opening a portal to the world…" : "The world is waking up…"}
              </div>
            )}

            {/* Subtitle track. The narration lives here too so your eyes stay
                on the world instead of darting to the side panel. */}
            {phase === "playing" && narration && (
              <div className={`subtitle ${speaking ? "speaking" : ""}`}>
                <p className="subtitle-jp">{narration.japanese}</p>
                {feedback && (
                  <p className={`subtitle-feedback ${feedback.ok ? "ok" : "no"}`}>
                    {feedback.text}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="isekai-hud">
            <div className="isekai-topline">
              <button className="isekai-leave" onClick={() => void leaveWorld()}>
                <ArrowLeftIcon /> Leave
              </button>
              <span className="isekai-title">
                {scenario?.titleJp}
                <em>{scenario?.titleEn}</em>
              </span>
              <span className={`isekai-live isekai-live-${session.status}`}>
                <span className="isekai-live-dot" />
                {statusLabel}
              </span>
            </div>

            {session.runStarted && (
              <div className={`session-meter ${elapsed >= 240 ? "warn" : ""}`}>
                <span className="session-meter-time">
                  {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                  {String(elapsed % 60).padStart(2, "0")}
                </span>
                <span className="session-meter-bar">
                  <span
                    className="session-meter-fill"
                    style={{ width: `${Math.min(100, (elapsed / 300) * 100)}%` }}
                  />
                </span>
                <span className="session-meter-cost">${(elapsed * 0.0097).toFixed(2)}</span>
              </div>
            )}

            {scenario && !isFreeform && (
              <div className="isekai-progress">
                <div className="isekai-progress-steps">
                  {scenario.steps.map((_, i) => (
                    <span
                      key={i}
                      className={`step ${i < stepIndex || phase === "complete" ? "done" : i === stepIndex ? "active" : ""}`}
                    >
                      {i < stepIndex || phase === "complete" ? <CheckIcon /> : i + 1}
                    </span>
                  ))}
                </div>
                <span className="isekai-streak">
                  <FlameIcon /> {streak}
                </span>
              </div>
            )}

            {scenario && isFreeform && phase !== "complete" && (
              <div className="isekai-progress">
                <span className="isekai-freeform-turn">Turn {turns + 1}</span>
                <span className="isekai-streak">
                  <FlameIcon /> {streak}
                </span>
              </div>
            )}

            {phase === "playing" && (
              <button
                type="button"
                className={`world-toggle ${worldAlive ? "alive" : ""}`}
                onClick={() => setWorldAlive((v) => !v)}
                aria-pressed={worldAlive}
                title={
                  worldAlive
                    ? "The world is moving on its own — click to hold it still"
                    : "The world is paused — click to bring it back to life"
                }
              >
                <span className="world-toggle-dot" />
                {worldAlive ? "Living world" : "World paused"}
              </button>
            )}

            {/* The ladder moves itself as you play; this is here so a returning
                player can jump, not so anyone has to self-assess before they
                start. */}
            {phase === "playing" && (
              <>
              <div className="level-picker" role="group" aria-label="Difficulty level">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`level-chip ${l.id === levelId ? "active" : ""}`}
                    onClick={() => {
                      setLevelId(l.id);
                      saveRung(l.id);
                    }}
                    title={l.blurb}
                  >
                    <span className="level-chip-jp">{l.nameJp}</span>
                    <span className="level-chip-en">{l.nameEn}</span>
                  </button>
                ))}
              </div>
              <p className="level-note">
                {levelId < FIRST_FREE_LEVEL_ID ? (
                  <>
                    No Japanese needed — you&rsquo;ll be saying words out loud within a minute.{" "}
                    <button
                      type="button"
                      className="level-jump"
                      onClick={() => {
                        setLevelId(FIRST_FREE_LEVEL_ID);
                        saveRung(FIRST_FREE_LEVEL_ID);
                      }}
                    >
                      I already know some Japanese →
                    </button>
                  </>
                ) : (
                  <>It adjusts itself as you play — this is just where you start.</>
                )}
              </p>
              </>
            )}

            {phase === "playing" && narrating && !narration && (
              <div className="narration narration-loading">
                <span className="isekai-spinner small" aria-hidden="true" />
                The world is finding its words…
              </div>
            )}

            {phase === "playing" && worldEvent && (
              <div className={`world-event ${worldEvent.urgent ? "urgent" : ""}`}>
                <span className="world-event-tag">
                  {worldEvent.urgent ? "The world needs you" : "Meanwhile"}
                </span>
                {worldEvent.text}
              </div>
            )}

            {phase === "playing" && narration && !isCompanion && (
              <Narration
                tokens={narration.tokens}
                english={narration.english}
                savedSurfaces={savedSurfaces}
                onSaveWord={handleSaveWord}
                onReplay={() => speak(narration.japanese)}
                speaking={speaking}
              />
            )}

            {phase === "playing" && isCompanion && companionLine && (
              <div className="companion-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="companion-avatar" src={COMPANION_IMAGE} alt="" />
                <div className="companion-speech">
                  <span className="companion-name">{COMPANION_NAME}</span>
                  <Narration
                    tokens={companionLine.tokens}
                    english={companionLine.replyEn}
                    savedSurfaces={savedSurfaces}
                    onSaveWord={handleSaveWord}
                    englishAlwaysOn
                    onReplay={() =>
                      speakSequence(
                        levelId <= 2
                          ? [companionLine.reply, companionLine.replyEn]
                          : [companionLine.reply],
                      )
                    }
                    speaking={speaking}
                  />
                </div>
              </div>
            )}

            {/* Beginner rungs. The world is open-ended here even in a scripted
                world — a beginner cannot hit a scripted objective, and the
                reward must never be gated behind competence. */}
            {phase === "playing" && !isCompanion && level.mode !== "free" && (
              <>
                {level.mode === "echo" && echoWord ? (
                  <>
                    <EchoCard
                      word={echoWord}
                      romaji={level.romaji}
                      onReplay={() => speak(echoWord.kana)}
                      speaking={speaking}
                      heard={answer}
                      state={echoState}
                    />
                    <MicButton
                      onResult={(text) => setAnswer(text)}
                      onSpeechEnd={() => {
                        sayEcho(answer);
                        setAnswer("");
                      }}
                      disabled={checking}
                      autoStart={phase === "playing"}
                      holdWhileSpeaking={speaking}
                    />
                  </>
                ) : level.mode === "choose" && choices ? (
                  <ChoiceCards
                    choices={choices}
                    onPick={(c) => void pickChoice(c)}
                    disabled={checking}
                    onSpeak={speak}
                  />
                ) : level.mode === "fill" && fillFrame ? (
                  <FillCard
                    frame={fillFrame}
                    onPick={pickFill}
                    disabled={checking}
                    onSpeak={speak}
                    showEnglish={level.support === "all" || level.support === "new"}
                  />
                ) : (
                  <div className="narration narration-loading">
                    <span className="isekai-spinner small" aria-hidden="true" />
                    {choosing ? "Looking at the world…" : "…"}
                  </div>
                )}
                <button className="isekai-finish" onClick={() => setPhase("complete")}>
                  Finish this story
                </button>
              </>
            )}

            {phase === "playing" && (isCompanion || (level.mode === "free" && (isFreeform || step))) && (
              <>
                <div className="isekai-objective">
                  {isCompanion ? (
                    <>
                      <div className="label">Say anything to {COMPANION_NAME}, in Japanese</div>
                      <div className="objective-en">
                        She&rsquo;ll answer — and the world moves with her.
                      </div>
                    </>
                  ) : isFreeform ? (
                    <>
                      <div className="label">Your turn — describe anything, in Japanese</div>
                      <div className="objective-en">
                        What happens next in your world? A creature, the weather, a new place — anything.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="label">Your turn — say it in Japanese</div>
                      <div className="objective-en">{step!.objectiveEn}</div>
                      <div className="objective-hint">
                        <span>hint</span>
                        {step!.hintJp}
                      </div>
                    </>
                  )}
                </div>

                <form
                  className="isekai-input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitAnswer();
                  }}
                >
                  <input
                    type="text"
                    className="isekai-input"
                    placeholder={level.inputHint}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={checking}
                  />
                  <MicButton
                    onResult={(text) => setAnswer(text)}
                    onSpeechEnd={() => void submitAnswer()}
                    disabled={checking}
                    autoStart={phase === "playing"}
                    holdWhileSpeaking={speaking}
                  />
                  <button
                    type="submit"
                    className="isekai-submit"
                    disabled={checking || !answer.trim()}
                    aria-label="Submit answer"
                  >
                    {checking ? <span className="isekai-spinner small" aria-hidden="true" /> : <SendIcon />}
                  </button>
                </form>

                {feedback && (
                  <div className={`isekai-feedback ${feedback.ok ? "ok" : "no"}`}>
                    {feedback.ok ? <CheckIcon /> : <RetryIcon />}
                    {feedback.text}
                  </div>
                )}

                {(isFreeform || isCompanion) && (
                  <button className="isekai-finish" onClick={() => setPhase("complete")}>
                    {isCompanion ? "End the walk" : "Finish this world"}
                  </button>
                )}
              </>
            )}

            {phase === "complete" && (
              <div className="isekai-complete">
                <SparkleIcon />
                <h2>You shaped this world</h2>
                <p>The world moved every time your words landed.</p>
                <div className="isekai-stats">
                  <div className="stat">
                    <span className="stat-value">{correctTurns}</span>
                    <span className="stat-label">Correct</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{turns}</span>
                    <span className="stat-label">Attempts</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">
                      {turns > 0 ? Math.round((correctTurns / turns) * 100) : 0}%
                    </span>
                    <span className="stat-label">Accuracy</span>
                  </div>
                </div>

                {sceneEvents.length > 0 && (
                  <div className="story-log">
                    <span className="story-log-title">The story you told</span>
                    <ol>
                      {sceneEvents.map((e, i) => (
                        <li key={`${e.at}-${i}`} className={`story-beat ${e.source}`}>
                          <span className="story-beat-who">
                            {e.source === "you" ? "You" : e.source === "companion" ? "Companion" : "World"}
                          </span>
                          <span className="story-beat-text">
                            {e.said && <em>&ldquo;{e.said}&rdquo; — </em>}
                            {e.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <button className="isekai-submit isekai-submit-wide" onClick={() => void leaveWorld()}>
                  Choose another world
                </button>
              </div>
            )}

            {phase !== "connecting" && phase !== "starting" && (
              reviewing ? (
                <VocabReview
                  entries={vocab}
                  onUpdated={setVocab}
                  onClose={() => setReviewing(false)}
                  onSpeak={speak}
                />
              ) : (
                <VocabPanel
                  entries={vocab}
                  onRemove={handleRemoveWord}
                  onSpeak={speak}
                  onReview={() => setReviewing(true)}
                />
              )
            )}

            {session.error && <div className="isekai-error">{session.error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Honours the OS "reduce motion" setting. Used to swap the autoplaying
// background video for a still frame, which also skips the video download.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function ScenarioPicker({ onPick }: { onPick: (s: Scenario) => void }) {
  const [freeformOpen, setFreeformOpen] = useState(false);
  const [freeformIdea, setFreeformIdea] = useState("");
  const reducedMotion = usePrefersReducedMotion();

  const startFreeform = () => {
    if (!freeformIdea.trim()) return;
    onPick(buildFreeformScenario(freeformIdea));
  };

  return (
    <>
      <div className="isekai-picker">
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="isekai-picker-bg" src="/art/hero.webp" alt="" />
        ) : (
          <video className="isekai-picker-bg" autoPlay muted loop playsInline poster="/art/hero.webp">
            <source src="/art/hero.mp4" type="video/mp4" />
          </video>
        )}
        <div className="isekai-picker-overlay" />
        <div className="isekai-picker-content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="isekai-brandmark" src="/icon.png" alt="" />
          <span className="eyebrow-jp">ゆめ · a dream shaped by words</span>
          <h1>Yume</h1>
          <Flourish />
          <a className="hero-badge" href="#worlds">
            <span className="hero-badge-icon">
              <GamepadIcon />
            </span>
            <span className="hero-badge-text">Learn Japanese by living in it, not a textbook</span>
            <span className="hero-badge-arrow">
              <ArrowRightIcon />
            </span>
          </a>
          <p className="isekai-tagline">
            Step into a world you actually want to be in — speak Japanese to it, and it moves.
          </p>
          <span className="hero-version">
            <span className="hero-version-dot" />
            version 0.1 · early preview
          </span>
        </div>
      </div>

      <div className="worlds-section" id="worlds">
        <div className="worlds-header">
          <span className="section-eyebrow">Pick your starting point</span>
          <h2 className="section-title">Choose a world</h2>
        </div>
        <div className="scenario-grid">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              className="scenario-card"
              style={{ "--card-art": `url(/art/${s.id}.webp)` } as CSSProperties}
              onClick={() => onPick(s)}
            >
              <span className="scenario-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="scenario-body">
                <span className="scenario-jp">{s.titleJp}</span>
                <span className="scenario-en">{s.titleEn}</span>
                <span className="scenario-steps">{s.steps.length} objectives</span>
              </span>
              <span className="scenario-arrow">
                <ArrowRightIcon />
              </span>
            </button>
          ))}

          <button
            className="scenario-card scenario-card-choices"
            style={{ "--card-art": "url(/art/night-city.webp)" } as CSSProperties}
            onClick={() => onPick(buildChoiceScenario())}
          >
            <span className="scenario-index">かな</span>
            <span className="scenario-body">
              <span className="scenario-jp">えらぶ</span>
              <span className="scenario-en">Choose the story</span>
              <span className="scenario-steps">No typing · kana only</span>
            </span>
            <span className="scenario-arrow">
              <ArrowRightIcon />
            </span>
          </button>

          {freeformOpen ? (
            <form
              className="scenario-card scenario-card-freeform-open"
              onSubmit={(e) => {
                e.preventDefault();
                startFreeform();
              }}
            >
              <span className="scenario-index">✨</span>
              <span className="scenario-body">
                <span className="scenario-jp">じゆうな せかい</span>
                <span className="scenario-en">Describe any world you want</span>
                <input
                  autoFocus
                  type="text"
                  className="freeform-input"
                  placeholder="a floating sky city at sunset…"
                  value={freeformIdea}
                  onChange={(e) => setFreeformIdea(e.target.value)}
                />
                <button type="submit" className="freeform-submit" disabled={!freeformIdea.trim()}>
                  Enter world <ArrowRightIcon />
                </button>
              </span>
            </form>
          ) : (
            <button
              className="scenario-card scenario-card-freeform"
              onClick={() => setFreeformOpen(true)}
            >
              <span className="scenario-index">✨</span>
              <span className="scenario-body">
                <span className="scenario-jp">じゆうな せかい</span>
                <span className="scenario-en">Create your own world</span>
                <span className="scenario-steps">Total creative freedom</span>
              </span>
              <span className="scenario-arrow">
                <ArrowRightIcon />
              </span>
            </button>
          )}

        </div>

        {/* Hina is a different kind of experience from the structured worlds —
            free conversation, no objectives — so she gets her own block
            rather than being a fifth peer in the grid. */}
        <button
          className="companion-feature"
          onClick={() => onPick(buildCompanionScenario())}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="companion-feature-art" src={COMPANION_IMAGE} alt="" />
          <span className="companion-feature-scrim" />
          <span className="companion-feature-body">
            <span className="companion-feature-tag">Companion mode</span>
            <span className="companion-feature-title">
              ひな <em>Walk and talk with Hina</em>
            </span>
            <span className="companion-feature-text">
              No objectives, no grading — just talk to her in Japanese. She answers out
              loud, and the world changes around you as she does.
            </span>
            <span className="companion-feature-cta">
              Start walking <ArrowRightIcon />
            </span>
          </span>
        </button>
      </div>
    </>
  );
}

// Decorative underline beneath the wordmark: a tapered gold rule with a small
// blossom resting on its right-hand end.
function Flourish() {
  return (
    <svg className="hero-flourish" viewBox="0 0 320 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="flourish-line" x1="0" y1="0" x2="320" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e8bf6a" stopOpacity="0" />
          <stop offset="0.35" stopColor="#f3d79b" stopOpacity="0.9" />
          <stop offset="0.72" stopColor="#ffd9e6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ec4d80" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M4 17C58 17 96 9 150 9c46 0 78 8 120 8"
        stroke="url(#flourish-line)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <g transform="translate(272 5)" fill="#ffd9e6">
        <circle cx="8" cy="8" r="2.1" fill="#f3c77e" />
        <ellipse cx="8" cy="2.6" rx="2.5" ry="3.4" />
        <ellipse cx="13" cy="6.4" rx="2.5" ry="3.4" transform="rotate(72 13 6.4)" />
        <ellipse cx="11.1" cy="12.3" rx="2.5" ry="3.4" transform="rotate(144 11.1 12.3)" />
        <ellipse cx="4.9" cy="12.3" rx="2.5" ry="3.4" transform="rotate(216 4.9 12.3)" />
        <ellipse cx="3" cy="6.4" rx="2.5" ry="3.4" transform="rotate(288 3 6.4)" />
      </g>
    </svg>
  );
}

function GamepadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 11h4M8 9v4M15.5 12h.01M18 10h.01" />
      <path d="M17.32 5H6.68a4.68 4.68 0 0 0-4.62 4L2 15.5A2.5 2.5 0 0 0 4.5 18c.9 0 1.6-.4 2.1-1l1.2-1.5h8.4l1.2 1.5c.5.6 1.2 1 2.1 1a2.5 2.5 0 0 0 2.5-2.5L21.94 9a4.68 4.68 0 0 0-4.62-4Z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6.5 19 6 6 0 0 1 6 16.5C6 12 10 10 9 5c1.5.5 3 2 3-3Z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="isekai-complete-icon" width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6ZM19 15c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

// Minimal ambient shape for the Web Speech API, which TypeScript's DOM lib
// does not (yet) declare. Only the handful of members this component uses.
type MinimalSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

// Minimal optional voice input using the browser's built-in speech
// recognition — no server key required, silently hidden if unsupported.
// Always-on listening: it arms itself when a world starts, so there is nothing
// to click and nothing to send. You just talk.
function MicButton({
  onResult,
  onSpeechEnd,
  disabled,
  autoStart,
  holdWhileSpeaking,
}: {
  onResult: (text: string) => void;
  onSpeechEnd: () => void;
  disabled: boolean;
  autoStart: boolean;
  holdWhileSpeaking: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [hearing, setHearing] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const armedRef = useRef(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True while our own TTS is talking. Without this the microphone hears the
  // narrator, transcribes her as the player, and she answers herself in a
  // loop — burning Groq calls and steering the world off nonsense input.
  const holdRef = useRef(false);
  holdRef.current = holdWhileSpeaking;

  // Handlers are installed once but fire seconds later, so they read the
  // latest callbacks from a ref rather than closing over stale ones.
  const handlers = useRef({ onResult, onSpeechEnd });
  handlers.current = { onResult, onSpeechEnd };

  const supported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
    );

  const start = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    // Interim results give a live transcript as you speak, so the box visibly
    // reacts rather than staying blank until you finish a sentence.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (holdRef.current) return;

      const results = event.results as unknown as {
        length: number;
        [i: number]: { isFinal?: boolean; [j: number]: { transcript: string } };
      };
      const last = results[results.length - 1];
      const text = last?.[0]?.transcript?.trim() ?? "";
      if (!text) return;

      setHearing(true);
      handlers.current.onResult(text);

      // Only a final result starts the send timer; interim ones just keep the
      // on-screen transcript current.
      if (last?.isFinal) {
        if (submitTimer.current) clearTimeout(submitTimer.current);
        submitTimer.current = setTimeout(() => {
          setHearing(false);
          if (!holdRef.current) handlers.current.onSpeechEnd();
        }, 1100);
      }
    };

    recognition.onerror = () => setHearing(false);
    recognition.onend = () => {
      setHearing(false);
      // Browsers cut the stream every ~60s; restart unless we were stopped.
      if (armedRef.current) {
        try {
          recognition.start();
        } catch {
          armedRef.current = false;
          setArmed(false);
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      armedRef.current = false;
      setArmed(false);
    }
  }, []);

  const stop = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    setHearing(false);
    if (submitTimer.current) clearTimeout(submitTimer.current);
    recognitionRef.current?.stop();
  }, []);

  // Arm as soon as the world is live. Entering a world is itself a user
  // gesture, which is what browsers require before opening the microphone.
  useEffect(() => {
    if (!autoStart || !supported || armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
    start();
  }, [autoStart, supported, start]);

  useEffect(
    () => () => {
      armedRef.current = false;
      if (submitTimer.current) clearTimeout(submitTimer.current);
      recognitionRef.current?.stop();
    },
    [],
  );

  if (!supported) return null;

  const held = armed && holdWhileSpeaking;

  return (
    <button
      type="button"
      className={`isekai-mic ${armed ? "armed" : ""} ${hearing && !held ? "listening" : ""} ${held ? "held" : ""}`}
      onClick={() => {
        if (armed) {
          stop();
          return;
        }
        armedRef.current = true;
        setArmed(true);
        start();
      }}
      disabled={disabled}
      title={
        !armed
          ? "Microphone off — click to listen"
          : held
            ? "Paused while the world is speaking"
            : "Listening — just talk"
      }
      aria-pressed={armed}
      aria-label={armed ? "Stop listening" : "Start listening"}
    >
      {armed ? <StopIcon /> : <MicIcon />}
    </button>
  );
}
