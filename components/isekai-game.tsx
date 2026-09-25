"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Narration as NarrationData, NarrationToken } from "@/app/api/narrate/route";
import { Narration } from "@/components/narration";
import { OrbisPlayer } from "@/components/orbis-player";
import { WordCard, type WordState } from "@/components/word-card";
import { stickerById } from "@/lib/sticker-set";
import type { MagicWord } from "@/app/api/words/route";
import type { QuotaState } from "@/app/api/quota/route";
import { VocabPanel } from "@/components/vocab-panel";
import { VocabReview } from "@/components/vocab-review";
import { WorldMagic, type Magic } from "@/components/world-magic";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { useRehearsalFlag, useRehearsalSession, type WorldSession } from "@/hooks/use-rehearsal-session";
import {
  FIRST_FREE_LEVEL_ID,
  getLevel,
  LEVELS,
  loadRung,
  nextRung,
  rungBrief,
  saveRung,
} from "@/lib/levels";
import type { Quest } from "@/app/api/quest/route";
import type { StickerReply } from "@/app/api/sticker/route";
import { DreamReel } from "@/components/dream-reel";
import { StickerAlbum, StickerToast, type ToastSticker } from "@/components/sticker-album";
import { createAmbience, type Ambience } from "@/lib/ambience";
import { createMomentRecorder, type DreamMoment, type MomentRecorder } from "@/lib/dream-moments";
import { describeDreams, recentDreams, rememberDream } from "@/lib/dreams";
import { DOOR_APPEARS, pickDestination, portalChallenge, type Destination } from "@/lib/portals";
import { addSticker, albumCount, shrinkImage } from "@/lib/stickers";
import { matchesSentenceEn, matchesWordEn } from "@/lib/english";
import { hasLearnChoice, LEARN, loadLearn, saveLearn, type Learn } from "@/lib/learn";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import {
  buildChoiceScenario,
  buildFreeformScenario,
  localCheck,
  SCENARIOS,
  type Scenario,
} from "@/lib/scenarios";
import { ChoiceCards } from "@/components/choice-cards";
import { FillCard } from "@/components/fill-card";
import { SentenceCard, type SentenceState } from "@/components/sentence-card";
import type { Choice } from "@/app/api/choices/route";
import type { FillFrame, FillOption } from "@/app/api/fill/route";
import type { SentenceChallenge } from "@/app/api/sentence/route";
import { matchesSentence, matchesWord, similarity, toRomaji } from "@/lib/romaji";
import { LOOK_WORDS, matchLook, type LookWord } from "@/lib/look";
import { addEvent, composeScene, type SceneEvent } from "@/lib/scene";
import {
  buildCompanionScenario,
  COMPANION_IMAGE,
  COMPANION_LISTENING,
  COMPANION_NAME,
  COMPANION_TALKING,
  whileCompanionTalks,
} from "@/lib/companion";
import type { CompanionReply } from "@/app/api/companion/route";
import { playMagic, unlockMagic, type MagicStrength } from "@/lib/magic-sound";
import { loadVocab, removeWord, saveWord, type VocabEntry } from "@/lib/vocab";

type CheckResponse = {
  correct: boolean;
  feedback: string;
  correctedJapanese: string;
  sceneAddEn?: string;
  /** What the player's sentence means, in English. */
  meaning?: string;
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

/**
 * A scene fragment as a steer. The Orbis prompt guide: after the opening
 * prompt, describe only the one visible change — restating the whole world
 * "signals a scene rebuild", and the picture degrades as prompts pile up.
 */
function asChange(fragment: string): string {
  const text = fragment.trim().replace(/[.。]+$/, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * The meaning a spell turns the player's words into (English, or Japanese for
 * someone learning English): no quotes, a capital, and a flourish.
 */
function tidyMeaning(text?: string): string | undefined {
  const t = text?.trim().replace(/^["“'‘「]+|["”'’」]+$/g, "").trim();
  if (!t) return undefined;
  const capital = `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  // A whole sentence lands with a bang; a single word ("night") stays a word.
  if (!/\s/.test(capital) || /[?？]$/.test(capital)) return capital;
  const bang = /[぀-ヿ一-龯]/.test(capital) ? "！" : "!";
  return `${capital.replace(/[.。!！]+$/, "")}${bang}`;
}

/**
 * The ambient world waits this long after the last steer or the last thing the
 * player did. Orbis needs 2-4s to land a change; the rest is so that a wrong
 * answer is visibly followed by nothing happening, not by a drift.
 */
const DRIFT_QUIET_MS = 12_000;
/** How long a transformed world is left to land, and be looked at, before the next sentence. */
const AFTER_TRANSFORM_MS = 5_000;
/**
 * Orbis's first chunk carries no picture; frames arrive a chunk or two later.
 * The first voice and the first card wait for them, so Hina's first words (and
 * her talking face) and a beginner's first word land on a world, not black.
 */
const FIRST_PICTURE_MS = 3_000;
/** Back-off before asking again when a card could not be fetched. */
const RETRY_MS = 4_000;
/** The mic stays deaf this long after our own voice stops, for the recogniser's late final result. */
const AUDIBLE_TAIL_MS = 700;
/**
 * "Stop talking" is sent this long before her last line ends: a prompt needs a
 * chunk (~1.8s) to reach the picture, so sending it at the end lands it late.
 */
const ENDING_LEAD_S = 1.5;
/**
 * A door to somewhere new appears after this long in one place, or after this
 * many changes — before the picture starts to drift (~2 min, measured live).
 * If nobody opens it, the dream refreshes itself in place at REFRESH_S.
 */
const PORTAL_AFTER_S = 95;
const PORTAL_AFTER_CHANGES = 4;
const REFRESH_S = 165;
/** A quest turns up after this many changes, and again after as many more. */
const QUEST_EVERY_CHANGES = 2;
/** The five-minute cap: nothing new starts in the last stretch of it. */
const SESSION_S = 300;
/** A sticker is handed over once the change it is for has landed. */
const STICKER_AFTER_MS = 9_000;
/** How long a big spell's mist takes to cover the picture: a restart hides behind it. */
const MIST_UP_MS = 1_400;
/** How loud the world's own sound stays while a voice is speaking over it. */
const WORLD_DUCKED = 0.25;

/** A small picture of the live world, for a sticker's memory. */
function snapshot(): string | null {
  const video = document.querySelector<HTMLVideoElement>(".world-stage video");
  const image = document.querySelector<HTMLImageElement>(".world-stage img");
  const source = video && video.videoWidth ? video : image && image.naturalWidth ? image : null;
  if (!source) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  try {
    canvas.getContext("2d")?.drawImage(source, 0, 0, 320, 180);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

/**
 * Resolves once the stage's video has shown `count` new frames — after a
 * restart, Orbis takes a few seconds to paint again, and the mist stays up
 * until it has. Gives up after `timeoutMs`; with no video (rehearsal) it
 * resolves almost at once.
 */
function freshFrames(count = 6, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    // A stalled stream presents nothing at all, so the clock has the last word.
    const giveUp = setTimeout(resolve, timeoutMs);
    const done = () => {
      clearTimeout(giveUp);
      resolve();
    };
    const started = Date.now();
    let seen = 0;
    const watch = () => {
      const video = document.querySelector<HTMLVideoElement>(".world-stage video");
      if (!video) return Date.now() - started > 1_000 ? done() : void setTimeout(watch, 250);
      if (!("requestVideoFrameCallback" in video)) return void setTimeout(done, 4_000);
      video.requestVideoFrameCallback(() => (++seen >= count ? done() : watch()));
    };
    watch();
  });
}

function IsekaiSession({
  clearJwt,
  getCurrentJwt,
  children,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
  children?: ReactNode;
}) {
  const live = useOrbisSession(clearJwt, getCurrentJwt);
  const rehearsal = useRehearsalSession();
  const rehearsing = useRehearsalFlag();
  const session: WorldSession = rehearsing ? rehearsal : live;

  // Orbis generates at 832×480 and upscales. The 2K tier costs bandwidth and
  // decode time — on a judge's laptop, or a slow connection — for a picture
  // that is barely sharper, so every world streams at 1080p.
  const { setResolution } = live;
  useEffect(() => setResolution("1080p"), [setResolution]);

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
  // Rung 0: one sentence taught a word at a time. A step equal to the word
  // count means "now say the whole thing".
  const [sentence, setSentence] = useState<SentenceChallenge | null>(null);
  const [sentenceStep, setSentenceStep] = useState(0);
  const [sentenceState, setSentenceState] = useState<SentenceState>("waiting");
  const [transforming, setTransforming] = useState(false);
  const [fillFrame, setFillFrame] = useState<FillFrame | null>(null);
  // While true, no new card is fetched: a steer is still landing.
  const [turnHold, setTurnHold] = useState(false);
  // Outcomes of recent turns, most recent last. Drives silent auto-levelling.
  const [rungHistory, setRungHistory] = useState<boolean[]>([]);
  const [narration, setNarration] = useState<NarrationData | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // True only while a voice is actually playing (plus a short tail) — the mic
  // is deaf exactly then, not for the seconds a line spends being generated.
  const [audible, setAudible] = useState(false);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Which language this world is for (lib/learn.ts). Asked each time a world is
  // picked, remembered as the next default.
  const [learn, setLearn] = useState<Learn>("ja");
  const [pendingWorld, setPendingWorld] = useState<Scenario | null>(null);
  const [learnRemembered, setLearnRemembered] = useState(false);
  useEffect(() => {
    setLearn(loadLearn());
    setLearnRemembered(hasLearnChoice());
  }, []);
  const learnRef = useRef(learn);
  learnRef.current = learn;
  const lang = LEARN[learn];

  // The dream reel: key moments recorded as they happen, and the words learned
  // on the way, turned into a short shareable video when the dream ends.
  const recorder = useRef<MomentRecorder | null>(null);
  recorder.current ??= createMomentRecorder();
  const sessionWords = useRef<{ word: string; meaning: string }[]>([]);
  const [dreamMoments, setDreamMoments] = useState<DreamMoment[] | null>(null);
  const noteWord = (word: string, meaning: string) => {
    if (!sessionWords.current.some((w) => w.word === word)) sessionWords.current.push({ word, meaning });
  };

  // Duet: two players, two languages, one dream. Player 1 learns Japanese and
  // player 2 English; the turn — and with it the language the world listens
  // for — passes over each time one of them changes the world.
  const [duet, setDuet] = useState(false);
  const duetRef = useRef(duet);
  duetRef.current = duet;
  const passTurn = () => {
    if (!duetRef.current) return;
    const next: Learn = learnRef.current === "ja" ? "en" : "ja";
    learnRef.current = next;
    setLearn(next);
  };

  // Live dreams left today (lib/server/quota.ts). Unknown until the server says;
  // a judge's link (?judge=CODE) turns this browser's pass into a judge's pass.
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [resting, setResting] = useState<"visitor" | "budget" | null>(null);
  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" });
      if (res.ok) setQuota(await res.json());
    } catch {
      // Without an answer the game stays open; /api/token still enforces it.
    }
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("judge");
    if (!code) {
      void refreshQuota();
      return;
    }
    url.searchParams.delete("judge");
    window.history.replaceState(null, "", url.toString());
    void fetch("/api/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((state: QuotaState | null) => (state ? setQuota(state) : refreshQuota()))
      .catch(() => refreshQuota());
  }, [refreshQuota]);
  // Why a world cannot start right now, if it cannot.
  const outOfDreams = (q: QuotaState | null): "visitor" | "budget" | null =>
    !q?.limited ? null : q.dreamsLeft <= 0 ? "visitor" : !q.open ? "budget" : null;

  // The lowest rung: three magic words, one of which is a whole turn.
  const [words, setWords] = useState<MagicWord[] | null>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const [wordState, setWordState] = useState<WordState>("waiting");
  const [wordSaid, setWordSaid] = useState<string | null>(null);
  const recentWords = useRef<string[]>([]);
  // A turn of the camera takes Orbis 5-12s; saying みぎ three times is one turn.
  const lastLookAt = useRef(0);

  // Quests: every few changes the world develops a small problem that the
  // player's words can solve, with the sentence to solve it taught like any
  // beginner sentence, and a gold sticker for finishing it.
  const [quest, setQuest] = useState<Quest | null>(null);
  const questRef = useRef(quest);
  questRef.current = quest;
  const questsDone = useRef<string[]>([]);
  const changesSinceQuest = useRef(0);
  const fetchingQuest = useRef(false);

  // Portals: after a while in one place a glowing door appears; the magic
  // words take the dream somewhere new (and start the picture afresh).
  const [portal, setPortal] = useState<Destination | null>(null);
  const portalRef = useRef(portal);
  portalRef.current = portal;
  const [travelling, setTravelling] = useState(false);
  const visited = useRef<string[]>([]);
  const placeStartedAt = useRef(0);
  const changesHere = useRef(0);

  // Stickers: each change the player's words make can earn one, drawn by fal.
  const [toast, setToast] = useState<ToastSticker | null>(null);
  const endToast = useCallback(() => setToast(null), []);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [stickerCount, setStickerCount] = useState(0);
  useEffect(() => setStickerCount(albumCount()), [albumOpen]);
  const sessionStickers = useRef<string[]>([]);

  // The world's own sound, made in the browser: waves, birds, crickets.
  const ambience = useRef<Ambience | null>(null);

  const level = getLevel(levelId);
  const brief = rungBrief(level, learn);
  const isFreeform = scenario?.id === "freeform";
  const isCompanion = scenario?.id === "companion";
  const step = scenario ? scenario.steps[stepIndex] : null;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timers and the SDK fire long after the render that created them, so
  // anything they read goes through a ref. (The session object in particular
  // is rebuilt on every render — depending on it restarts whatever it is in.)
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sceneEventsRef = useRef<SceneEvent[]>([]);
  sceneEventsRef.current = sceneEvents;
  const scenarioRef = useRef<Scenario | null>(null);
  scenarioRef.current = scenario;
  const levelRef = useRef(levelId);
  levelRef.current = levelId;
  const modeRef = useRef(level.mode);
  modeRef.current = level.mode;
  const checkingRef = useRef(false);
  checkingRef.current = checking;
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  const narratingRef = useRef(false);
  narratingRef.current = narrating;
  const pendingStart = useRef<string | null>(null);
  const pendingSteer = useRef<string | null>(null);
  const lastSteerAt = useRef(0);
  // The last thing the player did: a word, an answer, a line to Hina.
  const lastActivityAt = useRef(0);
  const audibleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdUntil = useRef(0);
  const sequenceEnding = useRef<(() => void) | null>(null);

  useEffect(() => setVocab(loadVocab()), []);
  // Where they got to last time. Read after mount so the server render and the
  // first client render agree.
  useEffect(() => setLevelId(loadRung()), []);

  // The world is the whole screen while you are in it; the page behind must
  // not scroll under your fingers.
  const inWorld = phase !== "pick";
  useEffect(() => {
    if (!inWorld) return;
    document.body.classList.add("in-world");
    return () => document.body.classList.remove("in-world");
  }, [inWorld]);

  /**
   * Steer the running world. Every steer goes through here so the ambient
   * world knows when the last one was, and so a prompt identical to the
   * current one (which would not re-render, and so never fire) is sent anyway.
   */
  const steerTo = useCallback((prompt: string) => {
    lastSteerAt.current = Date.now();
    const current = sessionRef.current;
    if (current.prompt === prompt) {
      pendingSteer.current = null;
      void current.steer();
      return;
    }
    pendingSteer.current = prompt;
    current.setPrompt(prompt);
  }, []);

  // Development only: lets a test script steer the live world directly, to
  // find out which changes Orbis actually renders, and how fast.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __yumeSteer?: (prompt: string) => void }).__yumeSteer = steerTo;
  }, [steerTo]);
  // The same, for a fresh start and for reading the session's state.
  const sessionRefForDev = useRef(session);
  sessionRefForDev.current = session;
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __yumeRestart?: (prompt: string) => Promise<boolean>; __yumeSession?: () => unknown };
    w.__yumeRestart = (prompt) => sessionRefForDev.current.restart(prompt);
    w.__yumeSession = () => {
      const s = sessionRefForDev.current as WorldSession & { events?: string[] };
      return { status: s.status, runStarted: s.runStarted, restarting: s.restarting, error: s.error, events: s.events };
    };
  }, []);

  /** Hold off fetching the next card for a moment, e.g. while a steer lands. */
  const holdTurn = useCallback((ms: number) => {
    holdUntil.current = Math.max(holdUntil.current, Date.now() + ms);
    setTurnHold(true);
    setTimeout(() => {
      if (Date.now() >= holdUntil.current - 20) setTurnHold(false);
    }, ms);
  }, []);

  // One voice at a time — a new line cuts off whatever is still playing.
  // Lines play back to back, so Hina can say something in Japanese and then
  // echo it in English without the second line cutting off the first.
  // `onEnding` fires once, a little before the last line finishes (or at once
  // if the sequence is cut off), which is when "stop talking" has to be sent.
  const speakSequence = useCallback((lines: string[], opts: { onEnding?: () => void; lang?: Learn } = {}) => {
    sequenceEnding.current?.();
    const queue = lines.map((l) => l.trim()).filter(Boolean);
    // The language the lines were asked for in, even if the duet turn passes
    // while they are still being spoken.
    const voice = opts.lang ?? learnRef.current;

    let ended = false;
    const ending = () => {
      if (ended) return;
      ended = true;
      if (sequenceEnding.current === ending) sequenceEnding.current = null;
      opts.onEnding?.();
    };
    sequenceEnding.current = ending;

    if (!queue.length) {
      ending();
      return;
    }

    audioRef.current?.pause();
    setSpeaking(true);

    let index = 0;
    const playNext = () => {
      if (index >= queue.length) {
        setSpeaking(false);
        ending();
        return;
      }
      const last = index === queue.length - 1;
      try {
        // Every spoken line is in the language being learned, in its own voice.
        const audio = new Audio(`/api/tts?lang=${voice}&text=${encodeURIComponent(queue[index++])}`);
        audioRef.current = audio;
        audio.onplaying = () => {
          if (audibleTimer.current) clearTimeout(audibleTimer.current);
          setAudible(true);
        };
        audio.onpause = () => {
          if (audibleTimer.current) clearTimeout(audibleTimer.current);
          audibleTimer.current = setTimeout(() => setAudible(false), AUDIBLE_TAIL_MS);
        };
        audio.onended = playNext;
        // A failed line shouldn't strand the rest of the queue.
        audio.onerror = playNext;
        if (last) {
          audio.ontimeupdate = () => {
            if (audio.duration && audio.duration - audio.currentTime <= ENDING_LEAD_S) ending();
          };
        }
        void audio.play().catch(playNext);
      } catch {
        playNext();
      }
    };
    playNext();
  }, []);

  const speak = useCallback((text: string, lang?: Learn) => speakSequence([text], { lang }), [speakSequence]);

  // The spell cast when the player's words change the world (see WorldMagic):
  // it fills the seconds Orbis needs to morph the picture. Only the player's
  // words cast it — the world's own drifting is not magic, and a wrong answer
  // is silence.
  const [magic, setMagic] = useState<Magic | null>(null);
  const endMagic = useCallback(() => setMagic(null), []);
  const magicRef = useRef<Magic | null>(null);
  magicRef.current = magic;
  /**
   * A sticker for a change the player's words made: the thing it was about,
   * from the core set or drawn by fal, kept with a small picture of the world
   * once the change has landed — which is also when it is handed over.
   */
  const earnSticker = useCallback((change: string, said?: string, meaning?: string, quest = false, known?: string) => {
    // A magic word already is a sticker; anything else is matched or drawn.
    const def = known ? stickerById(known) : undefined;
    const asked: Promise<StickerReply | null> = def
      ? Promise.resolve({ sticker: { id: def.id, en: def.en, ja: def.ja, src: def.src, fresh: false } })
      : fetch("/api/sticker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: change }),
        })
          .then((res) => (res.ok ? (res.json() as Promise<StickerReply>) : null))
          .catch(() => null);
    setTimeout(async () => {
      const reply = await asked;
      if (!reply?.sticker) return;
      const still = snapshot();
      const memory = still ? await shrinkImage(still, 200).catch(() => undefined) : undefined;
      const { id, en, ja, src } = reply.sticker;
      addSticker({ id, en, ja, src, said, meaning, memory, at: Date.now(), quest });
      if (!sessionStickers.current.includes(en)) sessionStickers.current.push(en);
      setStickerCount(albumCount());
      setToast({ id, en, ja, src, quest });
    }, STICKER_AFTER_MS);
  }, []);

  const castMagic = useCallback(
    (
      strength: MagicStrength,
      words?: string,
      {
        sound = strength,
        onReveal,
        meaning,
        change,
        quest = false,
        sticker,
      }: {
        sound?: MagicStrength;
        onReveal?: () => void;
        meaning?: string;
        change?: string;
        quest?: boolean;
        /** The sticker this change earns, when it is already known. */
        sticker?: string;
      } = {},
    ) => {
      const said = tidyMeaning(meaning);
      setMagic({ id: Date.now(), strength, words, meaning: said, onReveal });
      if (words && strength !== "small") {
        // A change the player's words made is a moment for the dream reel; the
        // steer goes out right after this, so its clip covers the change.
        recorder.current?.capture({ said: words, meaning: said, strength });
        if (change) earnSticker(change, words, said, quest, sticker);
        changesSinceQuest.current += 1;
        changesHere.current += 1;
        // In a duet, the world now listens for the other player's language.
        passTurn();
      }
      const seconds = playMagic(sound, scenarioRef.current?.id);
      // Our own music must not reach the recogniser as the player's voice.
      if (seconds) {
        if (audibleTimer.current) clearTimeout(audibleTimer.current);
        setAudible(true);
        audibleTimer.current = setTimeout(() => setAudible(false), seconds * 1000 + AUDIBLE_TAIL_MS);
      }
    },
    [earnSticker],
  );

  const narrateScene = useCallback(
    async (scene: string, aloud = true, change?: string) => {
      if (!scene.trim()) return;
      setNarrating(true);
      // Narrated in the language of whoever made the change, even if the turn passes meanwhile.
      const lang = learnRef.current;
      try {
        const res = await fetch("/api/narrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene, level: levelId, change, learn: lang }),
        });
        if (!res.ok) {
          setNarration(null);
          return;
        }
        const data: NarrationData = await res.json();
        setNarration(data);
        if (aloud) speak(data.japanese, lang);
      } catch {
        setNarration(null);
      } finally {
        setNarrating(false);
      }
    },
    [levelId, speak],
  );
  const narrateRef = useRef(narrateScene);
  narrateRef.current = narrateScene;

  /** Her voice, with her face doing the talking and then the listening. */
  const hinaSays = useCallback(
    (reply: CompanionReply, lang: Learn = learnRef.current) => {
      // Beginners hear the English echo too; past that it stays on screen
      // only, so the Japanese keeps carrying the turn. Someone learning English
      // reads her Japanese echo instead: spoken in her English voice, it would
      // be the one line she mispronounces.
      const echo = levelRef.current <= 2 && lang === "ja";
      const lines = echo ? [reply.reply, reply.replyEn] : [reply.reply];
      speakSequence(lines, { onEnding: () => steerTo(COMPANION_LISTENING), lang });
    },
    [speakSequence, steerTo],
  );

  // The lowest rung: three single words that each change this scene. All three
  // are said aloud when they arrive, so there is something to copy.
  const offerWords = useCallback(
    async (scene: string) => {
      if (!scene.trim()) return;
      setChoosing(true);
      setWordState("waiting");
      try {
        const res = await fetch("/api/words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene, learn: learnRef.current, recent: recentWords.current }),
        });
        if (!res.ok) {
          holdTurn(RETRY_MS);
          return;
        }
        const data: { words?: MagicWord[] } = await res.json();
        if (!data.words?.length) {
          holdTurn(RETRY_MS);
          return;
        }
        setWords(data.words);
        speakSequence(data.words.map((w) => w.word), { lang: learnRef.current });
      } catch {
        holdTurn(RETRY_MS);
      } finally {
        setChoosing(false);
      }
    },
    [holdTurn, speakSequence],
  );

  // Rung 0: a sentence built from what is in the scene, whose payoff changes
  // the whole world.
  const offerSentence = useCallback(
    async (scene: string) => {
      if (!scene.trim()) return;
      setChoosing(true);
      setSentenceStep(0);
      setSentenceState("waiting");
      try {
        const res = await fetch("/api/sentence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene,
            recent: sceneEventsRef.current
              .filter((e) => e.transform)
              .map((e) => e.label || e.said || "")
              .filter(Boolean)
              .slice(-4),
            learn: learnRef.current,
          }),
        });
        if (!res.ok) {
          holdTurn(RETRY_MS);
          return;
        }
        const challenge: SentenceChallenge = await res.json();
        setSentence(challenge);
        // Hear the first word before being asked to say it.
        const first = challenge.parts.find((p) => p.kind === "word");
        if (first) speak(first.kana);
      } catch {
        holdTurn(RETRY_MS);
      } finally {
        setChoosing(false);
      }
    },
    [speak, holdTurn],
  );

  // Rung 2: a sentence frame with one gap and three ways to fill it.
  const offerFill = useCallback(
    async (scene: string) => {
      if (!scene.trim()) return;
      setChoosing(true);
      try {
        const res = await fetch("/api/fill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene,
            recent: sceneEventsRef.current.filter((e) => e.source === "you").slice(-3).map((e) => e.text),
            learn: learnRef.current,
          }),
        });
        if (!res.ok) {
          holdTurn(RETRY_MS);
          return;
        }
        setFillFrame(await res.json());
      } catch {
        holdTurn(RETRY_MS);
      } finally {
        setChoosing(false);
      }
    },
    [holdTurn],
  );

  // Rung 1: two kana-only options for whatever the scene is now.
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
            learn: learnRef.current,
          }),
        });
        if (!res.ok) {
          holdTurn(RETRY_MS);
          return;
        }
        const data: { choices: Choice[] } = await res.json();
        if (data.choices?.length) setChoices(data.choices);
        else holdTurn(RETRY_MS);
      } catch {
        holdTurn(RETRY_MS);
      } finally {
        setChoosing(false);
      }
    },
    [holdTurn],
  );

  // Whatever rung you are on, if its card is missing and nothing is on its
  // way, fetch one. Driven by state rather than called by hand, so a level
  // change — from the picker or from silent auto-levelling — can never leave
  // the player looking at an empty card.
  useEffect(() => {
    if (phase !== "playing" || !scenario || isCompanion || turnHold || choosing) return;
    if (!session.runStarted) return;
    if (level.mode === "word" && !words) void offerWords(runningScene);
    else if (level.mode === "sentence" && !sentence) void offerSentence(runningScene);
    else if (level.mode === "choose" && !choices) void offerChoices(runningScene);
    else if (level.mode === "fill" && !fillFrame) void offerFill(runningScene);
  }, [
    phase,
    scenario,
    isCompanion,
    turnHold,
    choosing,
    session.runStarted,
    level.mode,
    sentence,
    words,
    choices,
    fillFrame,
    runningScene,
    offerWords,
    offerSentence,
    offerChoices,
    offerFill,
  ]);

  // The world keeps moving whether or not you act. This is what makes a live
  // model load-bearing rather than decorative — and it's effectively free,
  // since Orbis bills for the seconds you're already holding regardless of
  // whether the scene changes.
  const driftBusy = useRef(false);
  const driftCount = useRef(0);

  useEffect(() => {
    if (phase !== "playing" || !worldAlive || !scenario || !session.runStarted) return;

    const id = setInterval(async () => {
      // Never talk over the player's turn, a steer still in flight, or a
      // voice mid-line — least of all Hina's, whose face is being steered.
      if (driftBusy.current || checkingRef.current || pendingSteer.current !== null) return;
      if (speakingRef.current) return;
      if (Date.now() - Math.max(lastSteerAt.current, lastActivityAt.current) < DRIFT_QUIET_MS) return;
      driftBusy.current = true;
      try {
        driftCount.current += 1;
        // Every third beat asks something of the player instead of just
        // drifting — but only where they can answer anything. Over a scripted
        // objective, or a word being taught, "call the rabbit" is a request the
        // game would then mark wrong.
        const freeToAnswer = scenario.id === "freeform" || scenario.id === "companion";
        const stakes = freeToAnswer && driftCount.current % 3 === 0;
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
        steerTo(asChange(drift.sceneAddEn));
        // On screen only. Spoken, it would hold the mic every twenty seconds
        // for the length of a line nobody asked for — and with Hina, the
        // narrator's voice would be mistaken for hers with her mouth shut.
        if (scenario.id !== "companion") {
          void narrateRef.current(composeScene(scenario.basePrompt, next), false, drift.sceneAddEn);
        }
      } catch {
        // A missed beat is harmless; the next tick tries again.
      } finally {
        driftBusy.current = false;
      }
    }, 22_000);

    return () => clearInterval(id);
  }, [phase, worldAlive, scenario, session.runStarted, steerTo]);

  const handleSaveWord = (token: NarrationToken) => {
    setVocab(saveWord({ surface: token.surface, reading: token.reading, meaning: token.meaning }));
  };

  const handleRemoveWord = (surface: string) => setVocab(removeWord(surface));

  const savedSurfaces = new Set(vocab.map((v) => v.surface));

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

  /**
   * Record how a turn went and move the rung if the pattern is clear.
   * Deliberately silent: the player should notice Hina speaking more Japanese,
   * not a number going up.
   */
  const recordTurn = useCallback((ok: boolean) => {
    // Development only: every graded turn, for the test harness.
    if (process.env.NODE_ENV === "development") {
      const w = window as unknown as { __turns?: { t: number; ok: boolean }[] };
      (w.__turns ??= []).push({ t: Date.now(), ok });
    }
    setRungHistory((history) => {
      const next = [...history, ok].slice(-6);
      setLevelId((current) => {
        const moved = nextRung(current, next);
        // えらぶ has no objective to type an answer to, so it tops out at the
        // rungs that bring their own cards.
        const capped = scenarioRef.current?.id === "choices" ? Math.min(moved, 2) : moved;
        if (capped !== current) {
          saveRung(capped);
          // Fresh slate after a move, or the same four turns would move it again.
          queueMicrotask(() => setRungHistory([]));
        }
        return capped;
      });
      return next;
    });
  }, []);

  // Companion mode is a conversation, not a graded turn: whatever you say goes
  // to Hina, she answers in Japanese, and her answer steers the world.
  const talkToCompanion = async (greeting = false) => {
    lastActivityAt.current = Date.now();
    // Her reply is in this player's language, even if a duet turn passes meanwhile.
    const lang = learnRef.current;
    // She remembers your earlier dreams.
    const memories = describeDreams(recentDreams(3));
    const said = answer.trim();
    if ((!greeting && !said) || checking || !scenario) return;
    setChecking(true);
    setFeedback(null);
    // She starts talking now, not when her audio arrives: the reply and its
    // voice take ~3s to come back, and a prompt takes 2-4s to reach her face.
    steerTo(COMPANION_TALKING);
    try {
      const ask = () =>
        fetch("/api/companion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            greeting
              ? { greeting: true, scene: runningScene, level: levelId, learn: lang, memories }
              : { said, scene: runningScene, level: levelId, history: conversation, learn: lang, memories },
          ),
        });
      let res = await ask();
      // Her first words are the whole welcome: a model hiccup must not leave
      // her standing there silent, so the greeting gets a second try.
      if (!res.ok && greeting) res = await ask();
      if (!res.ok) {
        steerTo(COMPANION_LISTENING);
        if (!greeting) setFeedback({ ok: false, text: `${COMPANION_NAME} didn't catch that — try again.` });
        return;
      }
      const data: CompanionReply = await res.json();

      setConversation((c) =>
        greeting
          ? [...c, { role: "companion", text: data.reply }]
          : [...c, { role: "you", text: said }, { role: "companion", text: data.reply }],
      );
      setCompanionLine(data);
      if (!greeting) {
        setAnswer("");
        setTurns((t) => t + 1);
      }

      if (data.sceneAddEn) {
        setSceneEvents((events) =>
          addEvent(events, { text: data.sceneAddEn, source: "companion", said: greeting ? undefined : said }),
        );
        // One clear change on top of the talking she is already doing — the
        // world around her is not restated, per the Orbis prompt guide.
        if (!greeting) castMagic("medium", said, { sound: "small", meaning: data.heardMeaning, change: data.sceneAddEn });
        steerTo(whileCompanionTalks(data.sceneAddEn));
      }
      hinaSays(data, lang);
    } catch {
      steerTo(COMPANION_LISTENING);
    } finally {
      setChecking(false);
    }
  };
  const greetRef = useRef(talkToCompanion);
  greetRef.current = talkToCompanion;

  useEffect(() => {
    if (phase === "starting" && session.runStarted) {
      setPhase("playing");
      holdTurn(FIRST_PICTURE_MS);
      const opening = runningScene;
      // Hina speaks first, so her first words come with her face moving; the
      // narrator opens only where the player answers freely — below that the
      // first thing heard is the word being taught.
      setTimeout(() => {
        const world = scenarioRef.current;
        if (!world) return;
        if (world.id === "companion") void greetRef.current(true);
        else if (modeRef.current === "free") void narrateRef.current(opening);
      }, FIRST_PICTURE_MS);
    }
  }, [phase, session.runStarted, runningScene, holdTurn]);

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
    setSentence(null);
    setSentenceStep(0);
    setSentenceState("waiting");
    setTransforming(false);
    setTurnHold(false);
    setFillFrame(null);
    setNarration(null);
    setRungHistory([]);
    setPanelOpen(false);
    recorder.current?.reset();
    sessionWords.current = [];
    sessionStickers.current = [];
    setDreamMoments(null);
    setWords(null);
    setWordSaid(null);
    setWordState("waiting");
    recentWords.current = [];
    setQuest(null);
    questsDone.current = [];
    changesSinceQuest.current = 0;
    setPortal(null);
    setTravelling(false);
    visited.current = [];
    changesHere.current = 0;
    placeStartedAt.current = 0;
    setToast(null);
    // Made on this click, which is what lets a browser play it.
    ambience.current ??= createAmbience();
    // The かな card is the choose rung by name, so picking it means that rung
    // however far up the ladder you had climbed.
    if (chosen.id === "choices") setLevelId(1);
    unlockMagic();
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
        // The token is refused once the day's dreams are used; say so kindly.
        const res = await fetch("/api/quota", { cache: "no-store" }).catch(() => null);
        const q: QuotaState | null = res?.ok ? await res.json() : null;
        if (q) setQuota(q);
        setResting(outOfDreams(q));
        return;
      }
      void refreshQuota();
    }

    pendingStart.current = chosen.basePrompt;
    session.setPrompt(chosen.basePrompt);
  };

  const leaveWorld = async () => {
    ambience.current?.stop();
    sequenceEnding.current = null;
    audioRef.current?.pause();
    setSpeaking(false);
    setMagic(null);
    // Unmount the world view before its tracks close, and so the "dream has
    // faded" screen does not flash while the session winds down.
    setPhase("pick");
    setScenario(null);
    await session.disconnectSession();
  };

  /**
   * The dream becomes a story. Clips still recording get their last seconds
   * (at most ~10), then the world is let go — Orbis bills every second it is
   * held, and the story screen does not need it — and the moments become the
   * dream reel. `ended`: the session is already gone (the five-minute cap).
   */
  const finishWorld = async (ended = false) => {
    sequenceEnding.current = null;
    audioRef.current?.pause();
    setSpeaking(false);
    setMagic(null);
    setPhase("complete");
    ambience.current?.stop();
    const rec = recorder.current;
    if (ended) rec?.stop();
    const moments = rec ? await rec.settle() : [];
    setDreamMoments(moments);
    // Kept for next time, so Hina can remember it.
    rememberDream({
      at: Date.now(),
      world: scenarioRef.current?.titleEn ?? "a dream",
      learn: learnRef.current,
      said: moments.slice(-4).map((m) => ({ text: m.said, meaning: m.meaning })),
      stickers: [...sessionStickers.current],
    });
    if (!ended) await session.disconnectSession();
  };
  const finishRef = useRef(finishWorld);
  finishRef.current = finishWorld;
  // Leaving a world you changed shows you the story of it; leaving one you
  // never touched just leaves.
  const leaveOrFinish = () =>
    void ((recorder.current?.list().length ?? 0) > 0 ? finishWorld() : leaveWorld());

  /** Steer the world and let it land before the next card. Shared by rungs 1 and 2. */
  const applyTurn = (sceneAddEn: string, said: string, meaning?: string) => {
    if (!scenario) return;
    const next = addEvent(sceneEventsRef.current, { text: sceneAddEn, source: "you", said });
    setSceneEvents(next);
    setWorldEvent(null);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);
    castMagic("medium", said, { meaning, change: sceneAddEn });
    steerTo(asChange(sceneAddEn));
    holdTurn(1200);
  };

  /**
   * The sentence landed. The world is steered with one clear transformation,
   * the whole new scene goes into the log as the new base for everything that
   * steers after it, and the narrator describing the new world is the reward.
   * The next sentence waits until that has landed and been heard.
   */
  const transformWorld = (challenge: SentenceChallenge) => {
    const next = addEvent(sceneEventsRef.current, {
      text: challenge.sceneEn,
      source: "you",
      said: challenge.sentenceKana,
      label: challenge.sentenceEn,
      transform: true,
    });
    setSceneEvents(next);
    setWorldEvent(null);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);
    setTransforming(true);
    setTurnHold(true);
    // The narrator describes the new world once the mist has cleared on it.
    castMagic("big", challenge.sentenceKana, {
      meaning: challenge.sentenceEn,
      change: challenge.changeEn,
      onReveal: () => void narrateRef.current(challenge.sceneEn),
    });
    steerTo(challenge.changeEn);
    settle(() => setSentence(null));
  };

  /**
   * Looking around: the camera turns (Orbis takes 5-12s), with a small spell
   * for the word. Not a change to the world, so no sticker and no new card.
   */
  const lookAround = (look: LookWord) => {
    lastActivityAt.current = Date.now();
    if (Date.now() - lastLookAt.current < 4_000) return;
    lastLookAt.current = Date.now();
    castMagic("small", look.word, { meaning: look.meaning });
    steerTo(look.prompt);
    setVocab(saveWord({ surface: look.word, reading: look.reading, meaning: look.meaning }));
  };

  /** One magic word was said: that thing happens, with the biggest spell. */
  const castWord = (w: MagicWord) => {
    const next = addEvent(sceneEventsRef.current, { text: w.changeEn, source: "you", said: w.word });
    setSceneEvents(next);
    setWorldEvent(null);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);
    setStreak((n) => n + 1);
    recordTurn(true);
    setWordSaid(w.word);
    setWordState("waiting");
    setTransforming(true);
    setTurnHold(true);
    recentWords.current = [...recentWords.current, w.id].slice(-6);
    setVocab(saveWord({ surface: w.word, reading: w.reading, meaning: w.meaning }));
    noteWord(w.word, w.meaning);
    castMagic("big", w.word, {
      meaning: w.meaning,
      change: w.changeEn,
      sticker: w.id,
      onReveal: () =>
        void narrateRef.current(composeScene(scenarioRef.current?.basePrompt ?? "", next), true, w.changeEn),
    });
    steerTo(asChange(w.changeEn));
    settle(() => {
      setWords(null);
      setWordSaid(null);
    });
  };

  /**
   * The lowest rung: any one of the three words, said on its own, is a whole
   * turn. Matched on the device; if nothing matched and the recogniser wrote
   * Japanese, one quick check of the closest word in case it was only spelled
   * differently (虹 for にじ).
   */
  const sayWord = async (said: string) => {
    lastActivityAt.current = Date.now();
    const offered = wordsRef.current;
    if (!offered || !scenario || transforming || judging.current || !said.trim()) return;
    const lang = learnRef.current;
    const look = matchLook(said, lang);
    if (look) return lookAround(look);
    const english = lang === "en";
    const spoken = (w: MagicWord) => ({ kana: w.word, romaji: w.reading, accept: w.accept });
    let hit = offered.find((w) => (english ? matchesWordEn(said, spoken(w)) : matchesWord(said, spoken(w))));
    if (!hit && !english && /[\u3040-\u30ff\u4e00-\u9faf]/.test(said)) {
      const heard = toRomaji(said);
      const closest = [...offered].sort((a, b) => similarity(heard, b.reading) - similarity(heard, a.reading))[0];
      judging.current = true;
      setWordState("checking");
      try {
        const res = await fetch("/api/heard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ said, target: closest.word, english: closest.meaning }),
        });
        if (res.ok && (await res.json()).ok) hit = closest;
      } catch {
        // No check means no match; they can simply say it again.
      } finally {
        judging.current = false;
      }
    }
    if (wordsRef.current !== offered) return;
    if (!hit) {
      setWordState("retry");
      return;
    }
    castWord(hit);
  };

  /** Once a big change has landed and been heard, the cards come back. */
  const settle = (done: () => void) => {
    const release = () => {
      if (speakingRef.current || narratingRef.current || magicRef.current) {
        setTimeout(release, 600);
        return;
      }
      done();
      setTransforming(false);
      setSentenceStep(0);
      setSentenceState("waiting");
      setTurnHold(false);
    };
    setTimeout(release, AFTER_TRANSFORM_MS);
  };

  /** The quest's sentence was said: the happy ending, and a gold sticker. */
  const solveQuest = (q: Quest) => {
    const next = addEvent(sceneEventsRef.current, { text: q.solvedEn, source: "you", said: q.sentenceKana, label: q.title });
    setSceneEvents(next);
    setWorldEvent(null);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);
    setTransforming(true);
    setTurnHold(true);
    questsDone.current.push(q.title);
    castMagic("big", q.sentenceKana, {
      meaning: q.sentenceEn,
      change: q.sticker,
      quest: true,
      onReveal: () =>
        void narrateRef.current(composeScene(scenarioRef.current?.basePrompt ?? "", next), true, q.solvedEn),
    });
    changesSinceQuest.current = 0;
    steerTo(asChange(q.solvedEn));
    settle(() => setQuest(null));
  };

  /**
   * The magic words were said at the door: the biggest spell there is, and
   * behind its mist Orbis starts afresh somewhere new — a new place, and a
   * clean picture, in the same session. The dream goes on as free play there.
   */
  const travel = (dest: Destination, card: SentenceChallenge) => {
    visited.current.push(dest.id);
    setTravelling(true);
    setTransforming(true);
    setTurnHold(true);
    setTurns((t) => t + 1);
    setCorrectTurns((c) => c + 1);
    castMagic("big", card.sentenceKana, {
      meaning: card.sentenceEn,
      change: "a glowing magic door",
      onReveal: () => void narrateRef.current(dest.basePrompt),
    });
    const world: Scenario = {
      id: "freeform",
      titleJp: dest.titleJp,
      titleEn: dest.titleEn,
      basePrompt: dest.basePrompt,
      steps: [],
    };
    // Behind the mist: through the door, and a fresh start on the other side.
    setTimeout(async () => {
      setScenario(world);
      setSceneEvents([]);
      setWorldEvent(null);
      setStepIndex(0);
      setSentence(null);
      setQuest(null);
      await session.restart(dest.basePrompt);
      await freshFrames();
      placeStartedAt.current = Date.now();
      changesHere.current = 0;
      setTravelling(false);
    }, MIST_UP_MS);
    settle(() => setPortal(null));
  };

  /**
   * Nobody took the door, and the picture is about to start drifting: the
   * dream starts itself afresh in place, inside a spell, from the scene as it
   * now stands.
   */
  const refreshWorld = () => {
    const world = scenarioRef.current;
    if (!world) return;
    setTravelling(true);
    setTurnHold(true);
    castMagic("big");
    setTimeout(async () => {
      await session.restart(composeScene(world.basePrompt, sceneEventsRef.current));
      await freshFrames();
      placeStartedAt.current = Date.now();
      setTravelling(false);
    }, MIST_UP_MS);
    settle(() => setPortal(null));
  };

  const openPortal = () => {
    const dest = pickDestination(visited.current);
    setPortal(dest);
    setSceneEvents((events) => addEvent(events, { text: DOOR_APPEARS, source: "world" }));
    steerTo(DOOR_APPEARS);
    startCard(portalChallenge(learnRef.current, levelRef.current < 0));
  };

  /** A quest or the door takes over the card: the first word for beginners, the whole sentence above. */
  const startCard = (card: SentenceChallenge) => {
    const words = card.parts.filter((p) => p.kind === "word");
    const whole = levelRef.current >= FIRST_FREE_LEVEL_ID;
    setSentenceStep(whole ? words.length : 0);
    setSentenceState("waiting");
    speak(whole ? card.sentenceKana : words[0]?.kana ?? card.sentenceKana);
  };

  /**
   * Rung 0, graded on the device with no network call: this is the first
   * Japanese a beginner ever speaks, and a second of latency at that moment is
   * the difference between "the world answered me" and "I submitted a form".
   */
  // The card being learned: the door's magic words, a quest's sentence, or
  // the rung-0 sentence, in that order.
  const portalCard = useMemo(() => (portal ? portalChallenge(learn, levelId < 0) : null), [portal, learn, levelId]);
  const questCard = useMemo<SentenceChallenge | null>(
    () => (quest ? { ...quest, changeEn: quest.solvedEn, sceneEn: "" } : null),
    [quest],
  );
  const card = portalCard ?? questCard ?? sentence;
  const sentenceWords = card ? card.parts.filter((p) => p.kind === "word") : [];
  const sentenceRef = useRef(card);
  sentenceRef.current = card;
  const judging = useRef(false);

  /**
   * The on-device match said no. Before telling a beginner they were wrong,
   * ask once whether the recogniser just spelled the right words differently
   * (差す for さす). Only Japanese text can have that problem — typed romaji
   * is judged on the device alone.
   */
  const heardAs = async (said: string, target: string, english?: string) => {
    if (learnRef.current !== "ja" || !/[぀-ヿ一-龯]/.test(said)) return false;
    judging.current = true;
    setSentenceState("checking");
    try {
      const res = await fetch("/api/heard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said, target, english }),
      });
      return res.ok && Boolean((await res.json()).ok);
    } catch {
      return false;
    } finally {
      judging.current = false;
    }
  };

  const saySentence = async (said: string) => {
    lastActivityAt.current = Date.now();
    if (!card || !scenario || transforming || judging.current) return;
    // "みぎ" on its own looks around, unless みぎ is the word being taught.
    const look = matchLook(said, learnRef.current);
    if (look && !sentenceWords.some((w) => w.kana === look.word)) return lookAround(look);
    if (sentenceState === "ok" || !said.trim()) return;
    const asked = card;
    const english = learn === "en";

    if (sentenceStep < sentenceWords.length) {
      const word = sentenceWords[sentenceStep];
      const ok =
        (english ? matchesWordEn(said, word) : matchesWord(said, word)) ||
        (await heardAs(said, word.kana, word.english));
      // They may have left, or the world moved on, while that was checked.
      if (sentenceRef.current !== asked) return;
      if (!ok) {
        setSentenceState("retry");
        // Hearing the target right after their own attempt is the most useful
        // correction there is.
        speak(word.kana);
        return;
      }
      if (sentenceWords.length === 1) {
        land(card);
        return;
      }
      setSentenceState("ok");
      castMagic("small", word.kana, { meaning: word.english });
      // An English word's "reading" is how it sounds, in katakana.
      const reading = english ? word.romaji || word.kana : word.kana;
      setVocab(saveWord({ surface: word.kana, reading, meaning: word.english ?? "" }));
      noteWord(word.kana, word.english ?? "");
      const nextStep = sentenceStep + 1;
      const nextTarget = nextStep < sentenceWords.length ? sentenceWords[nextStep].kana : card.sentenceKana;
      setTimeout(() => {
        setSentenceStep(nextStep);
        setSentenceState("waiting");
        speak(nextTarget);
      }, 650);
      return;
    }

    const ok =
      (english ? matchesSentenceEn(said, sentenceWords) : matchesSentence(said, sentenceWords)).ok ||
      (await heardAs(said, card.sentenceKana, card.sentenceEn));
    if (sentenceRef.current !== asked) return;
    if (!ok) {
      setSentenceState("retry");
      recordTurn(false);
      speak(card.sentenceKana);
      return;
    }
    land(card);
  };

  /** The card was said: the door opens, the quest is solved, or the world transforms. */
  const land = (said: SentenceChallenge) => {
    setSentenceState("ok");
    recordTurn(true);
    setStreak((s) => s + 1);
    if (portal && said === portalCard) travel(portal, said);
    else if (quest && said === questCard) solveQuest(quest);
    else transformWorld(said);
  };

  /** Rung 2. No option is wrong — whichever is picked is what happens. */
  const pickFill = (option: FillOption) => {
    if (!fillFrame || checking) return;
    const said = fillFrame.frameKana.replace("___", option.kana);
    setFillFrame(null);
    recordTurn(true);
    setStreak((s) => s + 1);
    setVocab(saveWord({ surface: option.kana, reading: option.kana, meaning: option.english }));
    noteWord(option.kana, option.english);
    speak(said);
    applyTurn(option.sceneAddEn, said, fillFrame.frameEn ? fillFrame.frameEn.replace("___", option.english) : option.english);
  };

  const pickChoice = (choice: Choice) => {
    if (!scenario || checking) return;
    setChoices(null);
    recordTurn(true);
    setVocab(saveWord({ surface: choice.kana, reading: choice.kana, meaning: choice.english }));
    noteWord(choice.kana, choice.english);
    speak(choice.kana);
    applyTurn(choice.sceneAddEn, choice.kana, choice.english);
  };

  const submitAnswer = async () => {
    lastActivityAt.current = Date.now();
    if (isCompanion) return talkToCompanion();
    if ((!isFreeform && !step) || !answer.trim() || checking) return;
    const look = matchLook(answer, learnRef.current);
    if (look) {
      setAnswer("");
      return lookAround(look);
    }
    setChecking(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isFreeform
            ? { learnerText: answer, freeform: true, sceneContext: runningScene, level: levelId, learn }
            : {
                learnerText: answer,
                objectiveEn: step!.objectiveEn,
                sampleAnswer: learn === "en" ? step!.sampleAnswerEn : step!.sampleAnswer,
                requiredAll: learn === "en" ? step!.requiredAllEn : step!.requiredAll,
                level: levelId,
                learn,
              },
        ),
      });
      const data: CheckResponse = res.ok
        ? await res.json()
        : isFreeform
          ? { correct: false, feedback: "Something went wrong — try again.", correctedJapanese: "" }
          : {
              correct: localCheck(step!, answer, learn).correct,
              feedback: "Offline check.",
              correctedJapanese: learn === "en" ? step!.sampleAnswerEn : step!.sampleAnswer,
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
        castMagic("medium", answer.trim(), { meaning: data.meaning, change: addition });
        if (addition) steerTo(asChange(addition));
        setAnswer("");

        // On success the narrator describing the changed world is the reward,
        // so it speaks instead of the correction — two voices would collide.
        void narrateScene(nextScene, true, addition);

        if (!isFreeform) {
          if (scenario && stepIndex + 1 < scenario.steps.length) {
            setTimeout(() => setStepIndex((i) => i + 1), 900);
          } else {
            setTimeout(() => void finishRef.current(), 900);
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
  // Counted from the world's first frame, and not restarted by a portal or a
  // refresh: the cap is on the session, which those do not end.
  const [elapsed, setElapsed] = useState(0);
  const clockStartedAt = useRef(0);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  useEffect(() => {
    if (phase !== "playing") {
      clockStartedAt.current = 0;
      setElapsed(0);
      return;
    }
    if (session.runStarted && !clockStartedAt.current) clockStartedAt.current = Date.now();
    const id = setInterval(() => {
      if (clockStartedAt.current) setElapsed(Math.floor((Date.now() - clockStartedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, session.runStarted]);

  const travellingRef = useRef(travelling);
  travellingRef.current = travelling;
  const transformingRef = useRef(transforming);
  transformingRef.current = transforming;

  // A quest turns up every few changes, once nothing else is going on.
  useEffect(() => {
    if (phase !== "playing" || !session.runStarted || !scenario || isCompanion) return;
    if (quest || portal || travelling || transforming || turnHold || fetchingQuest.current) return;
    if (changesSinceQuest.current < QUEST_EVERY_CHANGES || elapsedRef.current > SESSION_S - 60) return;
    fetchingQuest.current = true;
    const world = scenario;
    void fetch("/api/quest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene: runningScene,
        learn: learnRef.current,
        recent: questsDone.current,
        oneWord: levelRef.current < 0,
      }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<Quest>) : null))
      .then((q) => {
        if (!q || scenarioRef.current !== world || portalRef.current || transformingRef.current) return;
        changesSinceQuest.current = 0;
        setQuest(q);
        setSceneEvents((events) => addEvent(events, { text: q.problemEn, source: "world" }));
        steerTo(asChange(q.problemEn));
        playMagic("small", world.id);
        startCard({ ...q, changeEn: q.solvedEn, sceneEn: "" });
      })
      .catch(() => {})
      .finally(() => {
        fetchingQuest.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session.runStarted, scenario, isCompanion, quest, portal, travelling, transforming, turnHold, sceneEvents.length]);

  // The door, and the refresh: checked every couple of seconds while playing.
  const openPortalRef = useRef(openPortal);
  openPortalRef.current = openPortal;
  const refreshRef = useRef(refreshWorld);
  refreshRef.current = refreshWorld;
  useEffect(() => {
    if (phase !== "playing" || !session.runStarted || isCompanion) return;
    if (!placeStartedAt.current) placeStartedAt.current = Date.now();
    const id = setInterval(() => {
      if (travellingRef.current || transformingRef.current || magicRef.current) return;
      if (SESSION_S - elapsedRef.current < 45) return;
      const here = (Date.now() - placeStartedAt.current) / 1000;
      if (here >= REFRESH_S) {
        refreshRef.current();
      } else if (
        !portalRef.current &&
        !questRef.current &&
        (here >= PORTAL_AFTER_S || changesHere.current >= PORTAL_AFTER_CHANGES)
      ) {
        openPortalRef.current();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [phase, session.runStarted, isCompanion]);

  // The world's own sound follows the scene, dips under voices, and makes way
  // when the player turns on the sound Orbis itself streams.
  useEffect(() => {
    if (phase === "playing" && session.runStarted) ambience.current?.setScene(runningScene);
  }, [phase, session.runStarted, runningScene]);
  useEffect(() => ambience.current?.duck(audible || speaking), [audible, speaking]);
  // The ambience stands in for the world while its own sound is off, and
  // hands over when the player turns that on.
  useEffect(() => ambience.current?.setEnabled(session.muted), [session.muted]);

  // The world plays with its sound on. A browser that will not play sound yet
  // would leave the picture frozen (the SDK swallows the refusal), so then the
  // world plays muted instead, and the Sound chip turns it on with a click.
  const toggleMutedRef = useRef(session.toggleMuted);
  toggleMutedRef.current = session.toggleMuted;
  useEffect(() => {
    if (phase !== "playing" || !session.runStarted || session.muted) return;
    const id = setTimeout(() => {
      const video = document.querySelector<HTMLVideoElement>(".world-stage video");
      if (!video?.srcObject || !video.paused) return;
      video.muted = true;
      void video.play().catch(() => {});
      toggleMutedRef.current();
    }, 2500);
    return () => clearTimeout(id);
  }, [phase, session.runStarted, session.muted]);

  // Voices come first: the world's own sound dips while anyone is speaking,
  // and comes back up gently afterwards.
  useEffect(() => {
    const video = document.querySelector<HTMLVideoElement>(".world-stage video");
    if (!video) return;
    const target = audible || speaking ? WORLD_DUCKED : 1;
    const from = video.volume;
    const start = performance.now();
    const ms = target < from ? 250 : 900;
    let frame = 0;
    const step = (now: number) => {
      // A frame's timestamp can come slightly before `start`; clamp both ends.
      const k = Math.min(1, Math.max(0, (now - start) / ms));
      video.volume = Math.min(1, Math.max(0, from + (target - from) * k));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [audible, speaking, session.runStarted]);

  const statusLabel = rehearsing
    ? "Rehearsal"
    : session.status === "ready"
      ? "Live"
      : session.status === "connecting"
        ? "Connecting"
        : session.status;

  // Once a world has been playing, losing the run means the session ended —
  // the 5-minute cap, or the connection dropping. Say so, rather than leaving
  // a frozen frame with nothing to explain it.
  // A portal or a refresh stops the run for a moment on purpose.
  const worldEnded = phase === "playing" && !session.runStarted && !session.restarting && !travelling;

  // A world that never wakes: the session dropped or errored before its first
  // frame, or Orbis took far longer than its usual ~20s. Say so and offer
  // another try, rather than a spinner that spins forever.
  const waking = phase === "connecting" || phase === "starting";
  const [wakeSlow, setWakeSlow] = useState(false);
  const [wakeFailed, setWakeFailed] = useState(false);
  const wasReady = useRef(false);
  useEffect(() => {
    if (!waking) {
      wasReady.current = false;
      setWakeSlow(false);
      setWakeFailed(false);
      return;
    }
    const slow = setTimeout(() => setWakeSlow(true), 8_000);
    const stuck = setTimeout(() => setWakeFailed(true), 75_000);
    return () => {
      clearTimeout(slow);
      clearTimeout(stuck);
    };
  }, [waking]);
  useEffect(() => {
    if (!waking) return;
    if (session.status === "ready") wasReady.current = true;
    if ((wasReady.current && session.status === "disconnected") || (phase === "starting" && session.error)) {
      setWakeFailed(true);
    }
  }, [waking, phase, session.status, session.error]);
  const tryAgain = () => {
    const again = scenario;
    void leaveWorld().then(() => again && void enterScenario(again));
  };
  // A quest or the door takes the card over, whatever the rung.
  const overlay = Boolean(portalCard || questCard);
  const answersFreely = !overlay && (isCompanion || (level.mode === "free" && (isFreeform || Boolean(step))));

  const levelPicker = (
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
            No {lang.target} needed. It adjusts itself as you play.{" "}
            <button
              type="button"
              className="level-jump"
              onClick={() => {
                setLevelId(FIRST_FREE_LEVEL_ID);
                saveRung(FIRST_FREE_LEVEL_ID);
              }}
            >
              I already know some {lang.target} →
            </button>
          </>
        ) : (
          <>It adjusts itself as you play — this is just where you start.</>
        )}
      </p>
    </>
  );

  return (
    <div className="isekai">
      <StickerAlbum open={albumOpen} onClose={() => setAlbumOpen(false)} learn={learn} />
      {phase === "pick" && (
        <>
          {/* A failed connect drops straight back here, and the world view
              that normally shows session.error has just unmounted — so
              without this the world silently bounces you home. */}
          {session.error && (
            <div className="connect-error">
              <strong>Could not open that world.</strong>
              <span>{session.error}</span>
            </div>
          )}
          <ScenarioPicker
            onPick={(world) => {
              const why = outOfDreams(quota);
              if (why) setResting(why);
              else setPendingWorld(world);
            }}
            onAlbum={() => setAlbumOpen(true)}
            stickers={stickerCount}
            quota={quota}
          />
          {resting && (
            <DreamsResting
              why={resting}
              onClose={() => setResting(null)}
              onAlbum={() => {
                setResting(null);
                setAlbumOpen(true);
              }}
            />
          )}
          {pendingWorld && (
            <LearnChooser
              world={pendingWorld}
              current={learnRemembered ? learn : null}
              onClose={() => setPendingWorld(null)}
              onChoose={(chosen) => {
                const world = pendingWorld;
                // Together: player 1 (learning Japanese) goes first.
                const first: Learn = chosen === "duet" ? "ja" : chosen;
                setDuet(chosen === "duet");
                setLearn(first);
                learnRef.current = first;
                if (chosen !== "duet") saveLearn(chosen);
                setLearnRemembered(true);
                setPendingWorld(null);
                void enterScenario(world);
              }}
            />
          )}
          {children}
        </>
      )}

      {phase !== "pick" && (
        <div className={`isekai-play ${panelOpen ? "panel-open" : ""}`}>
          {/* The world is the screen, not a picture on it. Everything else
              floats over it and stays out of the way. */}
          <div className="world-stage">
            {rehearsing ? (
              <RehearsalWorld
                scenarioId={scenario?.id ?? ""}
                prompt={rehearsal.lastSteer}
                running={session.runStarted}
              />
            ) : (
              <OrbisPlayer
                muted={session.muted}
                // Kept on screen through a restart: the last picture holds
                // under the mist instead of dropping to black.
                runStarted={session.runStarted || session.restarting || travelling}
                status={session.status}
                fit="cover"
              />
            )}
            <div className="world-scrim" aria-hidden="true" />
            {travelling && (
              <div className="world-veil" aria-live="polite">
                <span lang="ja">{scenario?.titleJp}</span>
                <small>{scenario?.titleEn}</small>
              </div>
            )}
            <WorldMagic magic={magic} onDone={endMagic} world={scenario?.id ?? ""} />
            <StickerToast sticker={toast} onDone={endToast} learn={learn} />
            {waking && !wakeFailed && (
              <div className="isekai-loading">
                <span className="isekai-spinner" aria-hidden="true" />
                {phase === "connecting" ? "Opening a portal to the world…" : "The world is waking up…"}
                {wakeSlow && (
                  <span className="isekai-loading-note">
                    A GPU is waking up just for your world. This can take about twenty seconds.
                  </span>
                )}
              </div>
            )}
          </div>

          <header className="world-top">
            <button className="isekai-leave" onClick={leaveOrFinish}>
              <ArrowLeftIcon /> Leave
            </button>
            <span className="isekai-title">
              {scenario?.titleJp}
              <em>{scenario?.titleEn}</em>
            </span>
            {duet && (
              <span className={`duet-turn ${learn}`} key={learn} aria-live="polite">
                {learn === "ja" ? "Player 1 · say it in Japanese" : "Player 2 · えいごで どうぞ"}
              </span>
            )}
            <div className="world-top-right">
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
                </div>
              )}
              <span className={`isekai-live isekai-live-${session.status}`}>
                <span className="isekai-live-dot" />
                {statusLabel}
              </span>
              {phase === "playing" && (
                <>
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
                    {worldAlive ? "Living" : "Paused"}
                  </button>
                  <button
                    type="button"
                    className={`world-chip ${session.muted ? "" : "on"}`}
                    onClick={session.toggleMuted}
                    aria-pressed={!session.muted}
                    title={session.muted ? "Hear the world’s own sound" : "Mute the world’s own sound"}
                  >
                    {session.muted ? <SoundOffIcon /> : <SoundOnIcon />}
                    <span className="world-chip-label">Sound</span>
                  </button>
                </>
              )}
              <button
                type="button"
                className={`world-chip ${panelOpen ? "on" : ""}`}
                onClick={() => setPanelOpen((v) => !v)}
                aria-expanded={panelOpen}
                title="Level, the narrator’s words, and your saved vocabulary"
              >
                <span className="world-chip-level" lang="ja">
                  {level.nameJp}
                </span>
                <span className="world-chip-label">{level.nameEn}</span>
                {streak > 0 && (
                  <span className="world-chip-streak">
                    <FlameIcon /> {streak}
                  </span>
                )}
              </button>
            </div>
          </header>

          {phase === "playing" && worldEvent && (
            <div className={`world-event world-toast ${worldEvent.urgent ? "urgent" : ""}`} key={worldEvent.text}>
              <span className="world-event-tag">
                {worldEvent.urgent ? "The world needs you" : "Meanwhile"}
              </span>
              {worldEvent.text}
            </div>
          )}

          {waking && wakeFailed ? (
            <div className="world-modal">
              <div className="world-ended world-wake-failed">
                <SparkleIcon />
                <h2>The world didn&rsquo;t wake up</h2>
                <p>
                  Orbis couldn&rsquo;t start a world this time. It happens now and then, and trying again
                  usually works.
                </p>
                <div className="world-ended-actions">
                  <button className="isekai-submit isekai-submit-wide" onClick={tryAgain}>
                    Try again
                  </button>
                  <button className="isekai-leave" onClick={() => void leaveWorld()}>
                    Back to the worlds
                  </button>
                </div>
              </div>
            </div>
          ) : worldEnded ? (
            <div className="world-modal">
              <div className="world-ended">
                <SparkleIcon />
                <h2>The dream has faded</h2>
                <p>
                  A live world runs for up to five minutes at a time. Step back in and it starts again,
                  fresh.
                </p>
                <div className="world-ended-actions">
                  <button
                    className="isekai-submit isekai-submit-wide"
                    onClick={tryAgain}
                  >
                    Dream again
                  </button>
                  <button className="isekai-leave" onClick={() => void finishWorld(true)}>
                    See your story
                  </button>
                </div>
              </div>
            </div>
          ) : phase === "complete" ? (
            <div className="world-modal">
              <div className="isekai-complete">
                <SparkleIcon />
                <h2>You shaped this world</h2>
                <p>The world moved every time your words landed.</p>

                {/* Your dream as a short video to keep and share, and the
                    moments it is made of. */}
                {dreamMoments === null ? (
                  <p className="dream-gathering">
                    <span className="isekai-spinner small" aria-hidden="true" /> Gathering your memories…
                  </p>
                ) : (
                  <DreamReel
                    moments={dreamMoments}
                    title={scenario?.titleEn ?? "Yume"}
                    lang={learn}
                    words={sessionWords.current}
                  />
                )}
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
                            {e.label ?? e.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <button type="button" className="album-open" onClick={() => setAlbumOpen(true)}>
                  Open your sticker book <span>{stickerCount}</span>
                </button>

                <button className="isekai-submit isekai-submit-wide" onClick={() => void leaveWorld()}>
                  Choose another world
                </button>
              </div>
            </div>
          ) : (
            phase === "playing" && (
              <div className="world-bottom">
                {/* Subtitles. With Hina, her own line is the subtitle. */}
                {!isCompanion && narration && (
                  <div className={`subtitle ${speaking ? "speaking" : ""}`}>
                    <p className="subtitle-jp" lang={lang.targetTag}>
                      {narration.japanese}
                    </p>
                    {narration.english && (
                      <p className="subtitle-en" lang={lang.helperTag}>
                        {narration.english}
                      </p>
                    )}
                    {feedback && answersFreely && (
                      <p className={`subtitle-feedback ${feedback.ok ? "ok" : "no"}`}>{feedback.text}</p>
                    )}
                  </div>
                )}

                {isCompanion && companionLine && (
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
                        learn={learn}
                        onReplay={() => {
                          steerTo(COMPANION_TALKING);
                          hinaSays(companionLine);
                        }}
                        speaking={speaking}
                      />
                    </div>
                  </div>
                )}

                {/* Beginner rungs. The world is open-ended here even in a
                    scripted world — a beginner cannot hit a scripted
                    objective, and the reward must never be gated behind
                    competence. */}
                {!isCompanion && (overlay || level.mode !== "free") && (
                  <>
                    {(overlay || level.mode === "sentence") && card ? (
                      <>
                        {portal && overlay ? (
                          <div className="quest-banner portal">
                            <span className="quest-tag">{learn === "en" ? "まほうの ドア" : "A magic door"}</span>
                            <strong lang={lang.helperTag}>
                              {learn === "en" ? `ドアの むこうは「${portal.titleJp}」` : `Behind it: ${portal.titleEn}`}
                            </strong>
                            <span lang={lang.helperTag}>
                              {learn === "en" ? "まほうの ことばで ドアを あけよう！" : "Say the magic words to open it!"}
                            </span>
                          </div>
                        ) : quest && overlay ? (
                          <div className="quest-banner">
                            <span className="quest-tag">{learn === "en" ? "クエスト" : "Quest"}</span>
                            <strong lang={lang.helperTag}>{quest.title}</strong>
                            <span lang={lang.helperTag}>{quest.ask}</span>
                          </div>
                        ) : null}
                        <SentenceCard
                          challenge={card}
                          step={sentenceStep}
                          state={sentenceState}
                          heard={answer}
                          romaji={level.romaji}
                          learn={learn}
                          speaking={speaking}
                          transforming={transforming}
                          onReplay={() =>
                            speak(
                              sentenceStep < sentenceWords.length
                                ? sentenceWords[sentenceStep].kana
                                : card.sentenceKana,
                            )
                          }
                          onTyped={saySentence}
                          mic={
                            <MicButton
                              onResult={(text) => {
                                lastActivityAt.current = Date.now();
                                setAnswer(text);
                              }}
                              onSpeechEnd={() => {
                                void saySentence(answer);
                                setAnswer("");
                              }}
                              disabled={checking}
                              autoStart={phase === "playing"}
                              holdWhileSpeaking={audible}
                              speech={lang.speech}
                            />
                          }
                        />
                      </>
                    ) : level.mode === "word" && words ? (
                      <WordCard
                        words={words}
                        looks={LOOK_WORDS[learn]}
                        state={wordState}
                        said={wordSaid}
                        heard={answer}
                        learn={learn}
                        transforming={transforming}
                        onHear={(word) => speak(word)}
                        onTyped={sayWord}
                        mic={
                          <MicButton
                            onResult={(text) => {
                              lastActivityAt.current = Date.now();
                              setAnswer(text);
                            }}
                            onSpeechEnd={() => {
                              void sayWord(answer);
                              setAnswer("");
                            }}
                            disabled={checking}
                            autoStart={phase === "playing"}
                            holdWhileSpeaking={audible}
                            speech={lang.speech}
                          />
                        }
                      />
                    ) : level.mode === "choose" && choices ? (
                      <ChoiceCards
                        choices={choices}
                        onPick={pickChoice}
                        disabled={checking}
                        onSpeak={speak}
                        learn={learn}
                      />
                    ) : level.mode === "fill" && fillFrame ? (
                      <FillCard
                        frame={fillFrame}
                        onPick={pickFill}
                        disabled={checking}
                        onSpeak={speak}
                        showEnglish={level.support === "all" || level.support === "new"}
                        learn={learn}
                      />
                    ) : (
                      <div className="world-waiting">
                        <span className="isekai-spinner small" aria-hidden="true" />
                        {choosing ? "The world is choosing its words…" : "…"}
                      </div>
                    )}
                  </>
                )}

                {answersFreely && (
                  <div className="world-answer">
                    {isCompanion ? (
                      !companionLine && (
                        <div className="isekai-objective">
                          <div className="label">
                            Say anything to {COMPANION_NAME}, in {lang.target}
                          </div>
                          <div className="objective-en">She&rsquo;ll answer — and the world moves with her.</div>
                        </div>
                      )
                    ) : isFreeform ? (
                      <div className="isekai-objective">
                        <div className="label">Your turn — describe anything, in {lang.target}</div>
                        <div className="objective-en">
                          What happens next in your world? A creature, the weather, a new place — anything.
                        </div>
                      </div>
                    ) : (
                      <div className="isekai-objective">
                        <div className="objective-top">
                          <div className="label">Your turn — say it in {lang.target}</div>
                          <div className="isekai-progress-steps">
                            {scenario!.steps.map((_, i) => (
                              <span
                                key={i}
                                className={`step ${i < stepIndex ? "done" : i === stepIndex ? "active" : ""}`}
                              >
                                {i < stepIndex ? <CheckIcon /> : i + 1}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Asked in the helper language, hinted in the one being learned. */}
                        <div className="objective-en" lang={lang.helperTag}>
                          {learn === "en" ? step!.objectiveJa : step!.objectiveEn}
                        </div>
                        <div className="objective-hint" lang={lang.targetTag}>
                          <span>hint</span>
                          {learn === "en" ? step!.hintEn : step!.hintJp}
                        </div>
                      </div>
                    )}

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
                        placeholder={brief.inputHint}
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={checking}
                        lang={lang.targetTag}
                      />
                      <MicButton
                        onResult={(text) => {
                          lastActivityAt.current = Date.now();
                          setAnswer(text);
                        }}
                        onSpeechEnd={() => void submitAnswer()}
                        disabled={checking}
                        autoStart={phase === "playing"}
                        holdWhileSpeaking={audible}
                        speech={lang.speech}
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

                    {feedback && !feedback.ok && (
                      <div className="isekai-feedback no">
                        <RetryIcon />
                        {feedback.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* Everything that is not the world: the ladder, the narrator's
              words to hover and save, and your vocabulary. Slides in over the
              world's edge rather than shrinking it. */}
          <aside className="world-panel" inert={!panelOpen}>
            <div className="world-panel-head">
              <span>Your journey</span>
              <button type="button" className="world-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <button type="button" className="album-open" onClick={() => setAlbumOpen(true)}>
              Sticker book <span>{stickerCount}</span>
            </button>

            {phase === "playing" && levelPicker}

            {!isCompanion && narration && (
              <Narration
                tokens={narration.tokens}
                english={narration.english}
                savedSurfaces={savedSurfaces}
                onSaveWord={handleSaveWord}
                onReplay={() => speak(narration.japanese)}
                speaking={speaking}
                learn={learn}
              />
            )}
            {!isCompanion && narrating && !narration && (
              <div className="narration narration-loading">
                <span className="isekai-spinner small" aria-hidden="true" />
                The world is finding its words…
              </div>
            )}

            {reviewing ? (
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
            )}

            {phase === "playing" && (
              <button className="isekai-finish" onClick={() => void finishWorld()}>
                {isCompanion ? "End the walk" : "Finish, and see your story"}
              </button>
            )}

            {session.error && <div className="isekai-error">{session.error}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Development only: stands in for the Orbis stream during a rehearsal. Shows
 * the world's artwork and, above it, the exact prompt Orbis would have been
 * steered with — so a take can be practised, and the steering read, for free.
 */
function RehearsalWorld({ scenarioId, prompt, running }: { scenarioId: string; prompt: string; running: boolean }) {
  const art = ["park", "classroom", "night-city"].includes(scenarioId)
    ? `/art/${scenarioId}.webp`
    : scenarioId === "companion"
      ? COMPANION_IMAGE
      : "/art/hero.webp";
  return (
    <div className="player rehearsal-world">
      {running && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rehearsal-art" src={art} alt="" />
      )}
      {running && prompt && (
        <div className="rehearsal-prompt">
          <span>Rehearsal · Orbis would be steered with</span>
          {prompt}
        </div>
      )}
    </div>
  );
}

function SoundOnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
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

/** Shown instead of a world when today's live dreaming is used up. */
function DreamsResting({
  why,
  onClose,
  onAlbum,
}: {
  why: "visitor" | "budget";
  onClose: () => void;
  onAlbum: () => void;
}) {
  return (
    <div className="dreams-resting" role="dialog" aria-modal="true" aria-label="The dream world is resting">
      <div className="dreams-resting-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stickers/moon.webp" alt="" />
        <h2>The dream world is resting</h2>
        <p>
          {why === "visitor"
            ? "You've used all of today's live dreams. Come back tomorrow for more!"
            : "So many dreamers came today that the dream world needs a rest. Come back tomorrow!"}
        </p>
        <p className="dreams-resting-sub">ゆめの せかいは おやすみちゅう。またあした！</p>
        <div className="dreams-resting-actions">
          <button type="button" className="album-open" onClick={onAlbum}>
            Look at my sticker book
          </button>
          <button type="button" className="dreams-resting-close" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioPicker({
  onPick,
  onAlbum,
  stickers,
  quota,
}: {
  onPick: (s: Scenario) => void;
  onAlbum: () => void;
  /** How many stickers are in the book already. */
  stickers: number;
  quota: QuotaState | null;
}) {
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
        <HeroStickers />
        <div className="isekai-picker-content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="isekai-brandmark" src="/art/sakura-sticker.webp" alt="" />
          <span className="eyebrow-jp">ゆめ · a dream shaped by words</span>
          <h1>Yume</h1>
          <Flourish />
          <a className="hero-badge" href="#worlds">
            <span className="hero-badge-icon">
              <GamepadIcon />
            </span>
            <span className="hero-badge-text">Let&apos;s play! Pick a world</span>
            <span className="hero-badge-arrow">
              <ArrowRightIcon />
            </span>
          </a>
          <p className="isekai-tagline">
            Say it in Japanese (or English) and the world changes: a whale leaps, night falls, a magic door
            opens. Your words are the magic.
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
          <div className="worlds-header-row">
            <button type="button" className="album-open" onClick={onAlbum}>
              My sticker book <span>{stickers}</span>
            </button>
            {quota?.limited && (
              <span className={`dreams-left ${quota.dreamsLeft && quota.open ? "" : "none"}`}>
                {quota.judge && <strong>Judge pass · </strong>}
                {!quota.dreamsLeft
                  ? "🌙 No live dreams left today. Come back tomorrow!"
                  : !quota.open
                    ? "🌙 The dream world is resting today. Come back tomorrow!"
                    : `🌙 ${quota.dreamsLeft} live ${quota.dreamsLeft === 1 ? "dream" : "dreams"} left today · up to 5 min each`}
              </span>
            )}
          </div>
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
              <CardSticker id={CARD_STICKERS[s.id]} />
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
            <CardSticker id="stars" />
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
              style={{ "--card-art": "url(/art/dream-sky.webp)" } as CSSProperties}
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
              style={{ "--card-art": "url(/art/dream-sky.webp)" } as CSSProperties}
              onClick={() => setFreeformOpen(true)}
            >
              <span className="scenario-index">✨</span>
              <span className="freeform-stickers" aria-hidden="true">
                {["unicorn", "rocket", "dragon", "sandcastle"].map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={id} src={`/stickers/${id}.webp`} alt="" />
                ))}
              </span>
              <span className="scenario-body">
                <span className="scenario-jp">じゆうな せかい</span>
                <span className="scenario-en">Make your own world</span>
                <span className="scenario-steps">A candy castle? A dinosaur beach? Anything!</span>
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
              No tests, no scores: just chat with her in Japanese or English. She talks back out loud,
              remembers your last adventure, and the world changes around you as she does.
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

/**
 * Before a world opens: which language is this dream for? Yume teaches both
 * ways — English speakers learn Japanese, Japanese speakers learn English — and
 * the last choice is the one already lit.
 */
function LearnChooser({
  world,
  current,
  onChoose,
  onClose,
}: {
  world: Scenario;
  /** Last time's choice, if there was one. */
  current: Learn | null;
  onChoose: (learn: Learn | "duet") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="learn-chooser" role="dialog" aria-modal="true" aria-labelledby="learn-title" onClick={onClose}>
      <div className="learn-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="learn-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="learn-world">
          <span lang="ja">{world.titleJp}</span> · {world.titleEn}
        </span>
        <h2 id="learn-title">
          What do you want to learn?
          <span lang="ja">なにを まなぶ？</span>
        </h2>
        <div className="learn-options">
          <button
            type="button"
            className={`learn-option learn-ja ${current === "ja" ? "last" : ""}`}
            onClick={() => onChoose("ja")}
            autoFocus={current !== "en"}
          >
            <span className="learn-big" lang="ja">
              にほんご
            </span>
            <span className="learn-name">Japanese</span>
            <span className="learn-desc">Speak Japanese to the world. Help comes in English.</span>
          </button>
          <button
            type="button"
            className={`learn-option learn-en ${current === "en" ? "last" : ""}`}
            onClick={() => onChoose("en")}
            autoFocus={current === "en"}
          >
            <span className="learn-big">English</span>
            <span className="learn-name" lang="ja">
              えいご
            </span>
            <span className="learn-desc" lang="ja">
              えいごで せかいに はなしかけよう。ヒントは にほんごで。
            </span>
          </button>
          <button type="button" className="learn-option learn-duet" onClick={() => onChoose("duet")}>
            <span className="learn-big">
              Together <span lang="ja">いっしょに</span>
            </span>
            <span className="learn-name">Two players, two languages</span>
            <span className="learn-desc">
              One of you speaks Japanese, the other English. Take turns — each word you say shows your friend what it means.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Decorative underline beneath the wordmark: a tapered gold rule with a small
// blossom resting on its right-hand end.
// A sticker from the sticker book on each world card, so the choice reads at a glance.
const CARD_STICKERS: Record<string, string> = { park: "cherry-blossom", classroom: "book", "night-city": "lantern" };

function CardSticker({ id }: { id?: string }) {
  if (!id) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="card-sticker" src={`/stickers/${id}.webp`} alt="" />;
}

// Stickers drifting around the hero's edges — the same ones you collect.
const HERO_STICKERS = [
  { id: "whale", x: 7, y: 20, size: 104, delay: 0 },
  { id: "rainbow", x: 88, y: 16, size: 96, delay: 0.8 },
  { id: "dragon", x: 90, y: 66, size: 112, delay: 1.6, wide: true },
  { id: "moon", x: 9, y: 70, size: 86, delay: 2.2, wide: true },
  { id: "unicorn", x: 22, y: 44, size: 80, delay: 1.1, wide: true },
  { id: "balloon", x: 78, y: 40, size: 78, delay: 0.4, wide: true },
  { id: "stars", x: 30, y: 12, size: 64, delay: 2.8, wide: true },
  { id: "treasure", x: 82, y: 86, size: 80, delay: 1.9, wide: true },
];

function HeroStickers() {
  return (
    <div className="hero-stickers" aria-hidden="true">
      {HERO_STICKERS.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.id}
          className={s.wide ? "wide" : undefined}
          src={`/stickers/${s.id}.webp`}
          alt=""
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

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
  onerror: ((event: { error?: string }) => void) | null;
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
  speech = "ja-JP",
}: {
  onResult: (text: string) => void;
  onSpeechEnd: () => void;
  disabled: boolean;
  autoStart: boolean;
  holdWhileSpeaking: boolean;
  /** The recogniser's language: whatever the player is learning. */
  speech?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [hearing, setHearing] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const armedRef = useRef(false);
  // Errors in a row since the last thing heard. Without a limit, a denied
  // permission or a browser whose speech service always fails (Brave) would
  // error, restart and error again forever.
  const failures = useRef(0);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True while our own TTS is talking. Without this the microphone hears the
  // narrator, transcribes her as the player, and she answers herself in a
  // loop — burning Groq calls and steering the world off nonsense input.
  const holdRef = useRef(false);
  holdRef.current = holdWhileSpeaking;
  const speechRef = useRef(speech);
  speechRef.current = speech;
  // The turn passed to the other language: stop, and the restart listens for it.
  useEffect(() => {
    const current = recognitionRef.current;
    if (!current || !armedRef.current || current.lang === speech) return;
    try {
      current.stop();
    } catch {
      // Already stopping; onend restarts it either way.
    }
  }, [speech]);

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
    recognition.lang = speechRef.current;
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

      failures.current = 0;
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

    recognition.onerror = (event) => {
      setHearing(false);
      // Silence is not a failure: Chrome reports "no-speech" every few
      // seconds of quiet, and the world is meant to be sat in quietly.
      if (event?.error === "no-speech" || event?.error === "aborted") return;
      failures.current += 1;
      const fatal = event?.error === "not-allowed" || event?.error === "service-not-allowed" || event?.error === "audio-capture";
      // Stand down; the typed box is always there.
      if (fatal || failures.current >= 3) {
        armedRef.current = false;
        setArmed(false);
      }
    };
    recognition.onend = () => {
      setHearing(false);
      // Browsers cut the stream every ~60s; restart unless we were stopped —
      // in whichever language is wanted now (a duet passes the turn).
      if (armedRef.current) {
        try {
          recognition.lang = speechRef.current;
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
