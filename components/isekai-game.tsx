"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrbisPlayer } from "@/components/orbis-player";
import { useOrbisSession, type OrbisSession } from "@/hooks/use-orbis-session";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import { localCheck, SCENARIOS, type Scenario } from "@/lib/scenarios";

type CheckResponse = {
  correct: boolean;
  feedback: string;
  correctedJapanese: string;
  method?: string;
};

export function IsekaiGame() {
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
      <IsekaiSession clearJwt={clearJwt} getCurrentJwt={getCurrentJwt} />
    </ReactorProvider>
  );
}

type Phase = "pick" | "connecting" | "starting" | "playing" | "complete";

function IsekaiSession({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);

  const [phase, setPhase] = useState<Phase>("pick");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [runningScene, setRunningScene] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [turns, setTurns] = useState(0);
  const [correctTurns, setCorrectTurns] = useState(0);

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

  useEffect(() => {
    if (phase === "starting" && session.runStarted) setPhase("playing");
  }, [phase, session.runStarted]);

  const enterScenario = async (chosen: Scenario) => {
    setScenario(chosen);
    setStepIndex(0);
    setRunningScene(chosen.basePrompt);
    setFeedback(null);
    setStreak(0);
    setTurns(0);
    setCorrectTurns(0);
    setPhase("connecting");

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

  const step = scenario ? scenario.steps[stepIndex] : null;

  const submitAnswer = async () => {
    if (!step || !answer.trim() || checking) return;
    setChecking(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learnerText: answer,
          objectiveEn: step.objectiveEn,
          sampleAnswer: step.sampleAnswer,
          requiredAll: step.requiredAll,
        }),
      });
      const data: CheckResponse = res.ok
        ? await res.json()
        : { correct: localCheck(step, answer).correct, feedback: "Offline check.", correctedJapanese: step.sampleAnswer };

      setTurns((t) => t + 1);
      setFeedback({ ok: data.correct, text: data.feedback });
      playFeedbackAudio(data.correctedJapanese);

      if (data.correct) {
        setCorrectTurns((c) => c + 1);
        setStreak((s) => s + 1);
        const nextScene = `${runningScene} ${step.sceneAdd}.`;
        setRunningScene(nextScene);
        pendingSteer.current = nextScene;
        session.setPrompt(nextScene);
        setAnswer("");

        if (scenario && stepIndex + 1 < scenario.steps.length) {
          setTimeout(() => setStepIndex((i) => i + 1), 900);
        } else {
          setTimeout(() => setPhase("complete"), 900);
        }
      } else {
        setStreak(0);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="isekai">
      {phase === "pick" && <ScenarioPicker onPick={enterScenario} />}

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
                {phase === "connecting" ? "Opening a portal to the world…" : "The world is waking up…"}
              </div>
            )}
          </div>

          <div className="isekai-hud">
            <div className="isekai-topline">
              <span className="isekai-title">
                {scenario?.titleJp} <em>— {scenario?.titleEn}</em>
              </span>
              <button className="isekai-leave" onClick={() => void leaveWorld()}>
                ⟵ Leave world
              </button>
            </div>

            {scenario && (
              <div className="isekai-progress">
                {scenario.steps.map((_, i) => (
                  <span
                    key={i}
                    className={`dot ${i < stepIndex || phase === "complete" ? "done" : i === stepIndex ? "active" : ""}`}
                  />
                ))}
                <span className="isekai-streak">🔥 {streak} streak</span>
              </div>
            )}

            {phase === "playing" && step && (
              <>
                <div className="isekai-objective">
                  <div className="label">Your turn — say it in Japanese:</div>
                  <div className="objective-en">{step.objectiveEn}</div>
                  <div className="objective-hint">hint: {step.hintJp}</div>
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
                    placeholder="にほんごで かいてください…"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={checking}
                  />
                  <MicButton onResult={(text) => setAnswer(text)} />
                  <button type="submit" className="isekai-submit" disabled={checking || !answer.trim()}>
                    {checking ? "…" : "Speak"}
                  </button>
                </form>

                {feedback && (
                  <div className={`isekai-feedback ${feedback.ok ? "ok" : "no"}`}>
                    {feedback.ok ? "✅" : "🌀"} {feedback.text}
                  </div>
                )}
              </>
            )}

            {phase === "complete" && (
              <div className="isekai-complete">
                <h2>🌸 You shaped this world!</h2>
                <p>
                  {correctTurns} / {turns} sentences landed. The world moved every time you got it right.
                </p>
                <button className="isekai-submit" onClick={() => void leaveWorld()}>
                  Choose another world
                </button>
              </div>
            )}

            {session.error && <div className="isekai-error">{session.error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioPicker({ onPick }: { onPick: (s: Scenario) => void }) {
  return (
    <div className="isekai-picker">
      <h1>Isekai 異世界</h1>
      <p className="isekai-tagline">
        You&rsquo;ve been pulled into a living world — and the only way to change it is to speak
        Japanese to it. Say it right, and the world moves.
      </p>
      <div className="scenario-grid">
        {SCENARIOS.map((s) => (
          <button key={s.id} className="scenario-card" onClick={() => onPick(s)}>
            <span className="scenario-jp">{s.titleJp}</span>
            <span className="scenario-en">{s.titleEn}</span>
            <span className="scenario-steps">{s.steps.length} objectives</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function playFeedbackAudio(text: string) {
  try {
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
    void audio.play().catch(() => {});
  } catch {
    // Audio playback is a nice-to-have; never block the game on it.
  }
}

// Minimal ambient shape for the Web Speech API, which TypeScript's DOM lib
// does not (yet) declare. Only the handful of members this component uses.
type MinimalSpeechRecognition = {
  lang: string;
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
function MicButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  const getCtor = (): SpeechRecognitionCtor | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  };

  const Ctor = getCtor();
  if (!Ctor) return null;

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      className={`isekai-mic ${listening ? "listening" : ""}`}
      onClick={toggleListening}
      title="Speak in Japanese"
    >
      {listening ? "🔴" : "🎙️"}
    </button>
  );
}
