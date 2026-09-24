// The player's sticker book, kept in this browser. Every change the player's
// words make to the world can earn a sticker (app/api/sticker); each keeps the
// moment it was earned: a small picture of the world, and what was said.

export type AlbumSticker = {
  id: string;
  en: string;
  ja: string;
  src: string;
  /** The words that earned it, and what they mean. */
  said?: string;
  meaning?: string;
  /** A small JPEG data URL of the world at that moment, ~200px wide. */
  memory?: string;
  /** When it was (last) earned. */
  at: number;
  /** Earned by finishing a quest: it gets a gold ribbon. */
  quest?: boolean;
};

const KEY = "yume.stickers.v1";
/** Fired on window after the album changes, so an open sticker book can refresh. */
export const ALBUM_EVENT = "yume-stickers";

export function loadAlbum(): AlbumSticker[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as AlbumSticker[]) : [];
    return Array.isArray(list) ? list.filter((s) => s && typeof s.id === "string") : [];
  } catch {
    return [];
  }
}

function save(album: AlbumSticker[]): AlbumSticker[] {
  // Memories are the heavy part. If storage is full, let the oldest ones go
  // (the stickers themselves stay) rather than lose the new sticker.
  let list = album;
  for (let tries = 0; tries < 6; tries++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      break;
    } catch {
      const oldest = [...list].filter((s) => s.memory).sort((a, b) => a.at - b.at).slice(0, 8);
      if (!oldest.length) break;
      const drop = new Set(oldest.map((s) => s.id));
      list = list.map((s) => (drop.has(s.id) ? { ...s, memory: undefined } : s));
    }
  }
  try {
    window.dispatchEvent(new Event(ALBUM_EVENT));
  } catch {
    // Not in a browser: nothing is listening anyway.
  }
  return list;
}

/**
 * Adds a sticker, or refreshes one already in the book: the newest moment
 * replaces the old one, and a quest ribbon, once earned, stays.
 */
export function addSticker(sticker: AlbumSticker): AlbumSticker[] {
  const album = loadAlbum();
  const old = album.find((s) => s.id === sticker.id);
  const merged: AlbumSticker = old
    ? {
        ...old,
        ...sticker,
        said: sticker.said ?? old.said,
        meaning: sticker.meaning ?? old.meaning,
        memory: sticker.memory ?? old.memory,
        quest: Boolean(old.quest || sticker.quest),
      }
    : sticker;
  return save([merged, ...album.filter((s) => s.id !== sticker.id)]);
}

export function albumCount(): number {
  return loadAlbum().length;
}

/**
 * Downsizes an image data URL in the browser, so a memory costs ~10 KB of
 * storage instead of the ~60 KB of the moment recorder's 640px stills.
 * Resolves to the original if it cannot be decoded.
 */
export function shrinkImage(dataUrl: string, width = 200): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, width / img.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}
