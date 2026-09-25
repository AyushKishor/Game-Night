import type { AnyGameModule } from "@/lib/engine/types";
import { crazyEights } from "./crazy-eights";
import { switchGame } from "./switch";

/** Every fully playable game. Order is the library order. */
export const GAMES: AnyGameModule[] = [crazyEights, switchGame];

/** Planned games that are not playable yet. Never offered as startable. */
export const COMING_SOON: { id: string; name: string; tagline: string; category: "card" | "party" }[] = [];

const byId = new Map(GAMES.map((g) => [g.meta.id, g]));

export function getGame(id: string | null | undefined): AnyGameModule | undefined {
  return id ? byId.get(id) : undefined;
}
