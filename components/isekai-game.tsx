"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Narration as NarrationData, NarrationToken } from "@/app/api/narrate/route";
import { Narration } from "@/components/narration";
import { OrbisPlayer } from "@/components/orbis-player";
import { VocabPanel } from "@/components/vocab-panel";
import { useOrbisSession, type OrbisSession } from "@/hooks/use-orbis-session";
import { DEFAULT_LEVEL_ID, getLevel, LEVELS } from "@/lib/levels";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import { buildFreeformScenario, localCheck, SCENARIOS, type Scenario } from "@/lib/scenarios";
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
  const [runningScene, setRunningScene] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [turns, setTurns] = useState(0);
  const [correctTurns, setCorrectTurns] = useState(0);

  const [levelId, setLevelId] = useState(DEFAULT_LEVEL_ID);
  const [narration, setNarration] = useState<NarrationData | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);

  const level = getLevel(levelId);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setVocab(loadVocab()), []);

  // One narrator at a time — a new line cuts off whatever is still playing.
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    try {
      audioRef.current?.pause();
      const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
      audioRef.current = audio;
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      void audio.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  }, []);

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

  useEffect(() => {
    if (phase === "starting" && session.runStarted) {
      setPhase("playing");
      void narrateScene(runningScene);
    }
  }, [phase, session.runStarted, narrateScene, runningScene]);

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

  const isFreeform = scenario?.id === "freeform";
  const step = scenario ? scenario.steps[stepIndex] : null;

  const submitAnswer = async () => {
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

      if (data.correct) {
        setCorrectTurns((c) => c + 1);
        setStreak((s) => s + 1);
        const addition = isFreeform ? data.sceneAddEn : step!.sceneAdd;
        const nextScene = addition ? `${runningScene} ${addition}.` : runningScene;
        setRunningScene(nextScene);
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
              <div className="level-picker" role="group" aria-label="Difficulty level">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`level-chip ${l.id === levelId ? "active" : ""}`}
                    onClick={() => setLevelId(l.id)}
                    title={l.blurb}
                  >
                    <span className="level-chip-jp">{l.nameJp}</span>
                    <span className="level-chip-en">{l.nameEn}</span>
                  </button>
                ))}
              </div>
            )}

            {phase === "playing" && narrating && !narration && (
              <div className="narration narration-loading">
                <span className="isekai-spinner small" aria-hidden="true" />
                The world is finding its words…
              </div>
            )}

            {phase === "playing" && narration && (
              <Narration
                tokens={narration.tokens}
                english={narration.english}
                savedSurfaces={savedSurfaces}
                onSaveWord={handleSaveWord}
                onReplay={() => speak(narration.japanese)}
                speaking={speaking}
              />
            )}

            {phase === "playing" && (isFreeform || step) && (
              <>
                <div className="isekai-objective">
                  {isFreeform ? (
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
                  <MicButton onResult={(text) => setAnswer(text)} />
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

                {isFreeform && (
                  <button className="isekai-finish" onClick={() => setPhase("complete")}>
                    Finish this world
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
                <button className="isekai-submit isekai-submit-wide" onClick={() => void leaveWorld()}>
                  Choose another world
                </button>
              </div>
            )}

            {phase !== "connecting" && phase !== "starting" && (
              <VocabPanel entries={vocab} onRemove={handleRemoveWord} onSpeak={speak} />
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
      aria-label={listening ? "Stop listening" : "Speak in Japanese"}
    >
      {listening ? <StopIcon /> : <MicIcon />}
    </button>
  );
}
