import { content } from "@/content";
import { DEFAULT_CONFIG } from "@/lib/engine/helpers";
import { advance, startGame, submitAction, viewCtx, type GameEnvelope, type RunnerEnv } from "@/lib/engine/runner";
import type { AnyGameModule, GameConfig, PlayerId } from "@/lib/engine/types";

export function makePlayers(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

export function makeEnv(players: PlayerId[], now = 1_000_000, autopilot: PlayerId[] = players): RunnerEnv {
  return {
    now,
    hostId: players[0]!,
    names: Object.fromEntries(players.map((p, i) => [p, `Player ${i + 1}`])),
    content,
    autopilot: new Set(autopilot),
    botDelayMs: 0,
  };
}

export function start(module: AnyGameModule, n: number, config: Partial<GameConfig> = {}, seed = "test-seed") {
  const players = makePlayers(n);
  const env = makeEnv(players);
  const cfg = { ...DEFAULT_CONFIG, ...module.presets.quick, ...config };
  const envelope = startGame(module, players, cfg, env, seed);
  return { players, env, envelope };
}

export function act(module: AnyGameModule, envelope: GameEnvelope, player: PlayerId, action: unknown, env: RunnerEnv) {
  const res = submitAction(module, envelope, player, action, env);
  if (!res.ok) throw new Error(`Action rejected: ${res.error} ${JSON.stringify(action)}`);
  return res.envelope;
}

/** Collect every card id in a player's private view (hand/grid) for privacy checks. */
export function privateCards(view: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  if (view && typeof view === "object" && "hand" in view) walk((view as { hand: unknown }).hand);
  return out;
}

/**
 * Play a whole game with every seat on autopilot. Moves time forward so
 * reveal screens and timers elapse. Checks privacy at every step when asked.
 */
export function simulate(
  module: AnyGameModule,
  n: number,
  config: Partial<GameConfig> = {},
  opts: { seed?: string; checkPrivacy?: boolean; maxSteps?: number; onStep?: (e: GameEnvelope) => void } = {},
) {
  const { players, env, envelope: first } = start(module, n, config, opts.seed);
  let envelope = first;
  let now = env.now;
  let steps = 0;
  const maxSteps = opts.maxSteps ?? 5000;
  while (!module.isOver(envelope.state) && steps < maxSteps) {
    now += 1000;
    const stepEnv = { ...env, now };
    const before = envelope.step;
    envelope = advance(module, envelope, stepEnv);
    if (envelope.step === before) {
      // nothing automatic happened; jump past any deadline
      const d = module.deadline(envelope.state);
      if (d !== null) now = Math.max(now, d);
      else {
        now += 60_000;
      }
    }
    steps++;
    opts.onStep?.(envelope);
    if (opts.checkPrivacy) assertPrivacy(module, envelope, { ...env, now });
  }
  return { players, envelope, env: { ...env, now }, steps };
}

export function assertPrivacy(module: AnyGameModule, envelope: GameEnvelope, env: RunnerEnv) {
  const ctx = viewCtx(envelope, env);
  const pub = JSON.stringify(module.publicView(envelope.state, ctx));
  for (const owner of envelope.players) {
    const secret = privateCards(module.privateView(envelope.state, owner, ctx));
    for (const card of secret) {
      if (pub.includes(`"${card}"`)) throw new Error(`Public view leaks ${owner}'s card ${card}`);
      for (const other of envelope.players) {
        if (other === owner) continue;
        const otherView = JSON.stringify(module.privateView(envelope.state, other, ctx));
        if (otherView.includes(`"${card}"`)) throw new Error(`${other} can see ${owner}'s card ${card}`);
      }
    }
  }
}
