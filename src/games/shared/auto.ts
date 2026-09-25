import type { GameContext, GameModule, PlayerId } from "@/lib/engine/types";

/**
 * Timeout helpers. When a timer expires the server plays sensible default
 * moves for whoever the game is waiting on (the same logic bots use).
 */
export function autoPlayFor<S, A extends { type: string }>(
  module: GameModule<S, A>,
  state: S,
  ctx: GameContext,
  players: PlayerId[],
): S {
  let current = state;
  for (const p of players) {
    for (let i = 0; i < 6 && module.pending(current).includes(p) && !module.isOver(current); i++) {
      const action = module.botAction(current, p, ctx);
      if (!action || module.validate(current, p, action, ctx)) break;
      current = module.apply(current, p, action, ctx);
    }
  }
  return current;
}

/** Auto-play everyone currently pending (turn games: the active player). */
export function autoPlayPending<S, A extends { type: string }>(module: GameModule<S, A>, state: S, ctx: GameContext): S {
  return autoPlayFor(module, state, ctx, module.pending(state));
}
