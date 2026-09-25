import { createRng, secureSeed } from "./rng";
import type { AnyGameModule, GameConfig, GameContext, PlayerId, ViewContext } from "./types";
import type { ContentLibrary } from "@/content";

/**
 * A running game as persisted inside a room. The `state` field contains
 * secret information (hands, deck order) and must never be sent to clients
 * directly — only through `publicView` / `privateView`.
 */
export interface GameEnvelope {
  gameId: string;
  seed: string;
  /** Monotonic counter; each state transition derives its RNG from seed + step. */
  step: number;
  state: unknown;
  config: GameConfig;
  players: PlayerId[];
  startedAt: number;
  lastActionAt: number;
}

export interface RunnerEnv {
  now: number;
  hostId: PlayerId;
  names: Record<PlayerId, string>;
  content: ContentLibrary;
  /** Players the server plays for: bots, and humans who left or lost connection. */
  autopilot: ReadonlySet<PlayerId>;
  /** Minimum pause between automated moves so humans can follow along. */
  botDelayMs: number;
}

export type ActionResult =
  | { ok: true; envelope: GameEnvelope }
  | { ok: false; error: string; code: "invalid" | "not_your_turn" | "game_over" | "bad_payload" };

function ctxFor(envelope: GameEnvelope, env: RunnerEnv): GameContext {
  return {
    now: env.now,
    rng: createRng(`${envelope.seed}:${envelope.step}`),
    config: envelope.config,
    content: env.content,
    hostId: env.hostId,
    names: env.names,
  };
}

export function viewCtx(envelope: GameEnvelope, env: Omit<RunnerEnv, "autopilot" | "botDelayMs">): ViewContext {
  return { now: env.now, config: envelope.config, content: env.content, hostId: env.hostId, names: env.names };
}

export function startGame(
  module: AnyGameModule,
  players: PlayerId[],
  config: GameConfig,
  env: RunnerEnv,
  seed: string = secureSeed(),
): GameEnvelope {
  if (players.length < module.meta.minPlayers) {
    throw new Error(`${module.meta.name} needs at least ${module.meta.minPlayers} players`);
  }
  if (players.length > module.meta.maxPlayers) {
    throw new Error(`${module.meta.name} allows at most ${module.meta.maxPlayers} players`);
  }
  const envelope: GameEnvelope = {
    gameId: module.meta.id,
    seed,
    step: 0,
    state: null,
    config,
    players: players.slice(),
    startedAt: env.now,
    lastActionAt: env.now,
  };
  envelope.state = module.setup(players.slice(), ctxFor(envelope, env));
  envelope.step = 1;
  return envelope;
}

export function submitAction(
  module: AnyGameModule,
  envelope: GameEnvelope,
  player: PlayerId,
  rawAction: unknown,
  env: RunnerEnv,
): ActionResult {
  if (module.isOver(envelope.state)) return { ok: false, error: "This game has finished.", code: "game_over" };
  if (!envelope.players.includes(player)) {
    return { ok: false, error: "You are not playing in this game.", code: "invalid" };
  }
  const parsed = module.actionSchema.safeParse(rawAction);
  if (!parsed.success) return { ok: false, error: "That action is not recognised.", code: "bad_payload" };
  const action = parsed.data;
  const error = module.validate(envelope.state, player, action, viewCtx(envelope, env));
  if (error) {
    const pending = module.pending(envelope.state);
    const code = pending.includes(player) ? "invalid" : "not_your_turn";
    return { ok: false, error, code };
  }
  const state = module.apply(envelope.state, player, action, ctxFor(envelope, env));
  return {
    ok: true,
    envelope: { ...envelope, state, step: envelope.step + 1, lastActionAt: env.now },
  };
}

/**
 * Runs everything that happens without a fresh human action:
 * expired timers and automated moves. Bounded so a buggy module can
 * never hang a request.
 */
export function advance(module: AnyGameModule, envelope: GameEnvelope, env: RunnerEnv): GameEnvelope {
  let current = envelope;
  for (let guard = 0; guard < 400; guard++) {
    if (module.isOver(current.state)) break;

    const deadline = module.deadline(current.state);
    if (deadline !== null && env.now >= deadline) {
      const state = module.onTimeout(current.state, ctxFor(current, env));
      current = { ...current, state, step: current.step + 1, lastActionAt: env.now };
      if (module.deadline(state) === deadline && !module.isOver(state)) break; // no progress; avoid loops
      continue;
    }

    if (env.now < current.lastActionAt + env.botDelayMs) break;
    const auto = module.pending(current.state).filter((p) => env.autopilot.has(p));
    let acted = false;
    for (const player of auto) {
      const ctx = ctxFor(current, env);
      const action = module.botAction(current.state, player, ctx);
      if (!action) continue;
      const result = submitAction(module, current, player, action, env);
      if (result.ok) {
        current = result.envelope;
        acted = true;
        break;
      }
    }
    if (!acted) break;
  }
  return current;
}

/** When the server next needs to run `advance` for this game, or null. */
export function nextWakeAt(module: AnyGameModule, envelope: GameEnvelope, env: RunnerEnv): number | null {
  if (module.isOver(envelope.state)) return null;
  const times: number[] = [];
  const deadline = module.deadline(envelope.state);
  if (deadline !== null) times.push(deadline);
  if (module.pending(envelope.state).some((p) => env.autopilot.has(p))) {
    times.push(envelope.lastActionAt + env.botDelayMs);
  }
  return times.length ? Math.min(...times) : null;
}
