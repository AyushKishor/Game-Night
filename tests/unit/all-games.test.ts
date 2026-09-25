import { describe, expect, it } from "vitest";
import { GAMES } from "@/games";
import type { BluffState } from "@/games/bluff";
import type { HoldemState } from "@/games/texas-holdem";
import { viewCtx } from "@/lib/engine/runner";
import { simulate } from "./sim";

const knownPublic: Record<string, (s: unknown) => string[]> = {
  bluff: (s) => (s as BluffState).reveal?.cards ?? [],
  "texas-holdem": (s) => Object.values((s as HoldemState).shown).flat(),
};

function counts(min: number, max: number): number[] {
  return [...new Set([min, Math.min(max, Math.max(min, 4)), max])];
}

describe("every game", () => {
  it("has at least 25 playable games with complete metadata", () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(25);
    const ids = new Set<string>();
    for (const g of GAMES) {
      expect(ids.has(g.meta.id)).toBe(false);
      ids.add(g.meta.id);
      expect(g.meta.rules.steps.length).toBeGreaterThanOrEqual(3);
      expect(g.meta.minPlayers).toBeLessThanOrEqual(g.meta.maxPlayers);
      expect(Object.keys(g.presets).sort()).toEqual(["long", "quick", "standard"]);
    }
  });

  for (const game of GAMES) {
    describe(game.meta.name, () => {
      for (const n of counts(game.meta.minPlayers, game.meta.maxPlayers)) {
        it(`completes a full simulated ${n}-player match with private data kept private`, () => {
          for (const preset of ["quick", "standard"] as const) {
            const { envelope, env, steps } = simulate(game, n, game.presets[preset], {
              checkPrivacy: true,
              knownPublic: knownPublic[game.meta.id],
              seed: `${game.meta.id}-${n}-${preset}`,
            });
            expect(game.isOver(envelope.state), `${game.meta.id} did not finish in ${steps} steps`).toBe(true);
            const results = game.results(envelope.state, viewCtx(envelope, env));
            expect(results.standings).toHaveLength(n);
            expect(results.standings.map((s) => s.playerId).sort()).toEqual(envelope.players.slice().sort());
            expect(results.standings[0]!.place).toBe(1);
            // Standings are ordered and places are consistent with scores.
            for (let i = 1; i < results.standings.length; i++) {
              const a = results.standings[i - 1]!;
              const b = results.standings[i]!;
              if (a.score === b.score) expect(b.place).toBe(a.place);
              else expect(b.place).toBe(i + 1);
            }
            expect(results.summary.length).toBeGreaterThan(3);
            // Views must be JSON-serialisable.
            const ctx = viewCtx(envelope, env);
            expect(() => JSON.stringify(game.publicView(envelope.state, ctx))).not.toThrow();
          }
        });
      }

      it("rejects malformed actions", () => {
        const { envelope } = simulate(game, game.meta.minPlayers, game.presets.quick, { maxSteps: 0 });
        expect(game.actionSchema.safeParse({ type: "definitely-not-an-action" }).success).toBe(false);
        expect(game.actionSchema.safeParse(null).success).toBe(false);
        expect(envelope).toBeTruthy();
      });

      it("is deterministic for a given seed", () => {
        const a = simulate(game, game.meta.minPlayers, game.presets.quick, { seed: "same" });
        const b = simulate(game, game.meta.minPlayers, game.presets.quick, { seed: "same" });
        expect(JSON.stringify(a.envelope.state)).toBe(JSON.stringify(b.envelope.state));
      });
    });
  }
});
