import type { AnyGameModule } from "@/lib/engine/types";
import { bluff } from "./bluff";
import { captionClash } from "./caption-clash";
import { clueRush } from "./clue-rush";
import { codeWords } from "./code-words";
import { colourClash } from "./colour-clash";
import { crazyEights } from "./crazy-eights";
import { emojiMovies } from "./emoji-movies";
import { goFish } from "./go-fish";
import { golf } from "./golf";
import { hearts } from "./hearts";
import { higherLower } from "./higher-lower";
import { majorityRules } from "./majority-rules";
import { memory } from "./memory";
import { mostLikely } from "./most-likely";
import { neverHaveIEver } from "./never-have-i-ever";
import { oldMaid } from "./old-maid";
import { powerGrab } from "./power-grab";
import { president } from "./president";
import { propertyDeal } from "./property-deal";
import { quickCategories } from "./quick-categories";
import { rankIt } from "./rank-it";
import { secretSignal } from "./secret-signal";
import { sevens } from "./sevens";
import { snap } from "./snap";
import { spades } from "./spades";
import { switchGame } from "./switch";
import { texasHoldem } from "./texas-holdem";
import { trivia } from "./trivia";
import { twentyOne } from "./twenty-one";
import { tycoon } from "./tycoon";
import { war } from "./war";

/** Every fully playable game, in library order. */
export const GAMES: AnyGameModule[] = [
  // Party games
  neverHaveIEver,
  trivia,
  emojiMovies,
  mostLikely,
  codeWords,
  clueRush,
  majorityRules,
  quickCategories,
  captionClash,
  rankIt,
  secretSignal,
  // Card games
  tycoon,
  propertyDeal,
  colourClash,
  texasHoldem,
  powerGrab,
  crazyEights,
  goFish,
  oldMaid,
  war,
  snap,
  memory,
  hearts,
  spades,
  president,
  bluff,
  sevens,
  golf,
  higherLower,
  twentyOne,
  switchGame,
];

/** Planned games that are not playable yet. Never offered as startable. */
export const COMING_SOON: { id: string; name: string; tagline: string; category: "card" | "party" }[] = [];

const byId = new Map(GAMES.map((g) => [g.meta.id, g]));

export function getGame(id: string | null | undefined): AnyGameModule | undefined {
  return id ? byId.get(id) : undefined;
}
