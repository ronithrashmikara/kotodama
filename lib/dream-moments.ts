// The key moments of a session, kept for the dream reel: what the player said,
// what it meant, and a few seconds of the live world changing because of it.
//
// Orbis streams into a <video> whose srcObject is a MediaStream, so a moment's
// clip is recorded straight off that stream — no server, no re-encode, and the
// game's own overlays (mist, words, cards) never end up in it. Where there is
// no live stream (rehearsal mode, or a frame not ready yet) a moment keeps
// stills of whatever the stage shows instead, and at worst just its words.

export type DreamMoment = {
  id: number;
  said: string;
  meaning?: string;
  strength: "medium" | "big";
  /** Date.now() when the words landed. */
  at: number;
  clip?: Blob;
  clipMime?: string;
  /** How long the clip actually ran, in ms. MediaRecorder's WebM has no duration of its own. */
  clipMs?: number;
  /** JPEG data URLs, about 640px wide: the world as the words landed, and after. */
  before?: string;
  after?: string;
};

export type MomentRecorder = {
  capture(m: { said: string; meaning?: string; strength: "medium" | "big" }): void;
  /** The moments so far, oldest first. Clips still recording are not in them yet. */
  list(): DreamMoment[];
  /** Resolves once every clip still recording has finished and been saved. */
  settle(): Promise<DreamMoment[]>;
  reset(): void;
  /** Ends every recording now, keeping what was captured. */
  stop(): void;
};

/**
 * A big spell's world takes 6-9s to land (measured live), a medium change a
 * little less; the clip runs past that, so it ends on the new world.
 */
const CLIP_MS: Record<DreamMoment["strength"], number> = { medium: 7000, big: 10_000 };
const STILL_WIDTH = 640;
const CLIP_BITRATE = 2_500_000;

function stage(): { video: HTMLVideoElement | null; image: HTMLImageElement | null } {
  return {
    video: document.querySelector<HTMLVideoElement>(".world-stage video"),
    image: document.querySelector<HTMLImageElement>(".world-stage img"),
  };
}

/** A JPEG of whatever the stage shows right now, or undefined if it has no picture yet. */
function still(): string | undefined {
  const { video, image } = stage();
  const source =
    video && video.readyState >= 2 && video.videoWidth
      ? { el: video, w: video.videoWidth, h: video.videoHeight }
      : image && image.complete && image.naturalWidth
        ? { el: image, w: image.naturalWidth, h: image.naturalHeight }
        : null;
  if (!source) return undefined;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = STILL_WIDTH;
    canvas.height = Math.round((STILL_WIDTH * source.h) / source.w);
    canvas.getContext("2d")?.drawImage(source.el, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  }
}

/** The live video tracks, if the stage has any. */
function liveTracks(video: HTMLVideoElement | null): MediaStreamTrack[] {
  if (!video) return [];
  let stream: MediaStream | null = video.srcObject instanceof MediaStream ? video.srcObject : null;
  if (!stream) {
    // A plain <video src>, e.g. a recorded world: capture what it plays.
    const capturable = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    try {
      stream = video.src && !video.paused ? (capturable.captureStream?.() ?? null) : null;
    } catch {
      stream = null;
    }
  }
  return stream?.getVideoTracks().filter((t) => t.readyState === "live") ?? [];
}

function clipMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
}

export function createMomentRecorder({ maxMoments = 8 }: { maxMoments?: number } = {}): MomentRecorder {
  let moments: DreamMoment[] = [];
  let nextId = 1;
  // Recordings in flight, by moment id: how to end one early, and when it is done.
  const live = new Map<number, { end: () => void; done: Promise<void> }>();

  /** Over the cap: the oldest medium moment goes first; big ones are the story. */
  const trim = () => {
    while (moments.length > maxMoments) {
      const i = moments.findIndex((m) => m.strength === "medium");
      const [gone] = moments.splice(i >= 0 ? i : 0, 1);
      live.get(gone.id)?.end();
    }
  };

  const capture: MomentRecorder["capture"] = ({ said, meaning, strength }) => {
    try {
      const moment: DreamMoment = { id: nextId++, said, meaning, strength, at: Date.now(), before: still() };
      moments = [...moments, moment];
      trim();

      const ms = CLIP_MS[strength];
      const tracks = liveTracks(stage().video);
      const mime = clipMime();
      if (!tracks.length || !mime) {
        // No live stream to record: keep a second still once the world has had time to change.
        let finish = () => {};
        const done = new Promise<void>((resolve) => (finish = resolve));
        const complete = () => {
          clearTimeout(timer);
          moment.after ??= still();
          live.delete(moment.id);
          finish();
        };
        const timer = setTimeout(complete, ms);
        live.set(moment.id, { end: complete, done });
        return;
      }

      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: CLIP_BITRATE });
      const chunks: Blob[] = [];
      const started = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = new Promise<void>((resolve) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (timer) clearTimeout(timer);
          if (chunks.length) {
            moment.clip = new Blob(chunks, { type: mime.split(";")[0] });
            moment.clipMime = moment.clip.type;
            moment.clipMs = Math.round(performance.now() - started);
          }
          moment.after = still() ?? moment.after;
          live.delete(moment.id);
          resolve();
        };
        // A stream that dies mid-clip (the session ended) still leaves what it recorded.
        recorder.onerror = () => {
          if (recorder.state !== "inactive") recorder.stop();
          else resolve();
        };
      });
      const end = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      live.set(moment.id, { end, done });
      recorder.start(1000);
      timer = setTimeout(end, ms);
    } catch {
      // A moment that cannot be recorded still keeps its words.
    }
  };

  return {
    capture,
    list: () => moments.map((m) => ({ ...m })),
    settle: async () => {
      await Promise.all([...live.values()].map((r) => r.done));
      return moments.map((m) => ({ ...m }));
    },
    reset: () => {
      for (const r of [...live.values()]) r.end();
      live.clear();
      moments = [];
    },
    stop: () => {
      for (const r of [...live.values()]) r.end();
    },
  };
}
