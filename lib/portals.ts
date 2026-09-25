import type { SentenceChallenge } from "@/app/api/sentence/route";
import type { Learn } from "@/lib/learn";

// Portals: a glowing door appears, the player says the magic words ("open the
// door"), and the dream travels somewhere new. Travelling is also how the
// picture stays clean: Orbis drifts after a couple of minutes (streaks, warped
// buildings), and a journey starts it afresh from a new prompt, hidden inside
// the biggest spell there is.

export type Destination = { id: string; titleJp: string; titleEn: string; basePrompt: string };

const STYLE = "Anime-style painterly background art, soft magical light, dreamlike and calm.";

export const DESTINATIONS: Destination[] = [
  {
    id: "sky-islands",
    titleJp: "そらの しま",
    titleEn: "The Sky Islands",
    basePrompt: `Little green islands floating among fluffy clouds in a bright blue sky, waterfalls spilling off their edges, a winding rope bridge between them. ${STYLE}`,
  },
  {
    id: "undersea",
    titleJp: "うみの なか",
    titleEn: "Under the Sea",
    basePrompt: `A sunlit underwater garden of coral and swaying seaweed, rays of light through turquoise water, bubbles rising, a sandy sea floor. ${STYLE}`,
  },
  {
    id: "candy-town",
    titleJp: "おかしの まち",
    titleEn: "Candy Town",
    basePrompt: `A cosy little town made of sweets: gingerbread houses with icing roofs, lollipop trees and a chocolate river, pastel colours, afternoon light. ${STYLE}`,
  },
  {
    id: "dino-valley",
    titleJp: "きょうりゅうの たに",
    titleEn: "Dinosaur Valley",
    basePrompt: `A lush green valley with giant ferns and palm trees, a calm river, gentle volcano mountains far away, warm morning light. ${STYLE}`,
  },
  {
    id: "moon-garden",
    titleJp: "つきの にわ",
    titleEn: "The Moon Garden",
    basePrompt: `A quiet garden on the moon: silver grass, glowing blue flowers, the round Earth hanging in a starry black sky, soft craters. ${STYLE}`,
  },
  {
    id: "toy-room",
    titleJp: "おもちゃの へや",
    titleEn: "The Toy Room",
    basePrompt: `A giant child's toy room seen from toy height: wooden blocks like buildings, a toy train track, plush animals, sunlight through a big window. ${STYLE}`,
  },
  {
    id: "flower-forest",
    titleJp: "はなの もり",
    titleEn: "The Flower Forest",
    basePrompt: `A forest of enormous flowers taller than trees, petals like umbrellas, a mossy path, butterflies, dappled golden light. ${STYLE}`,
  },
];

/** Somewhere not yet visited this dream (or anywhere, once all have been). */
export function pickDestination(visited: string[]): Destination {
  const fresh = DESTINATIONS.filter((d) => !visited.includes(d.id));
  const pool = fresh.length ? fresh : DESTINATIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The door appearing in the world, as Orbis is steered with it. */
export const DOOR_APPEARS =
  "A tall glowing magic door appears standing in the middle of the scene, warm golden light spilling from its edges.";

/** The magic words, taught like any beginner sentence. */
export function portalChallenge(learn: Learn, oneWord = false): SentenceChallenge {
  // The lowest rung: one word opens it.
  if (oneWord) {
    return learn === "en"
      ? {
          parts: [{ kana: "open", kind: "word", romaji: "オープン", english: "あけて", accept: ["opens", "opened", "opening"] }],
          sentenceKana: "Open",
          sentenceRomaji: "オープン",
          sentenceEn: "あけて！",
          changeEn: "The magic door swings open in a flood of golden light.",
          sceneEn: "",
        }
      : {
          parts: [{ kana: "あけて", kind: "word", romaji: "akete", english: "open!", accept: ["開けて", "あける", "開ける", "あけ"] }],
          sentenceKana: "あけて",
          sentenceRomaji: "akete",
          sentenceEn: "Open!",
          changeEn: "The magic door swings open in a flood of golden light.",
          sceneEn: "",
        };
  }
  if (learn === "en") {
    return {
      parts: [
        { kana: "open", kind: "word", romaji: "オープン", english: "あける", accept: ["opens", "opened", "opening"] },
        { kana: "the", kind: "particle", romaji: "ザ" },
        { kana: "door", kind: "word", romaji: "ドア", english: "ドア", accept: ["doors", "portal", "gate"] },
      ],
      sentenceKana: "Open the door",
      sentenceRomaji: "オープン ザ ドア",
      sentenceEn: "ドアを あける",
      changeEn: "The magic door swings open in a flood of golden light.",
      sceneEn: "",
    };
  }
  return {
    parts: [
      { kana: "ドア", kind: "word", romaji: "doa", english: "door", accept: ["とびら", "扉", "どあ"] },
      { kana: "を", kind: "particle" },
      { kana: "あける", kind: "word", romaji: "akeru", english: "open", accept: ["開ける", "あけて", "開けて", "あけます", "開けます"] },
    ],
    sentenceKana: "ドアを あける",
    sentenceRomaji: "doa o akeru",
    sentenceEn: "Open the door.",
    changeEn: "The magic door swings open in a flood of golden light.",
    sceneEn: "",
  };
}
