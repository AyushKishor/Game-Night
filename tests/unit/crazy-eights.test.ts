import { describe, expect, it } from "vitest";
import { crazyEights } from "@/games/crazy-eights";
import type { SheddingState } from "@/games/shared/shedding";
import { advance, submitAction } from "@/lib/engine/runner";
import { act, assertPrivacy, simulate, start } from "./sim";

const S = (e: { state: unknown }) => e.state as SheddingState;

describe("Crazy Eights", () => {
  it("deals 7 cards for two players and 5 for more", () => {
    expect(Object.values(S(start(crazyEights, 2).envelope).hands).map((h) => h.length)).toEqual([7, 7]);
    expect(Object.values(S(start(crazyEights, 4).envelope).hands).every((h) => h.length === 5)).toBe(true);
  });

  it("never starts the pile with a wild eight", () => {
    for (let i = 0; i < 30; i++) {
      const { envelope } = start(crazyEights, 3, {}, `seed-${i}`);
      expect(S(envelope).discard[0]!.startsWith("8")).toBe(false);
    }
  });

  it("rejects moves out of turn and illegal cards", () => {
    const { envelope, env, players } = start(crazyEights, 3);
    const state = S(envelope);
    const notTurn = players.find((p) => p !== state.turn)!;
    const r1 = submitAction(crazyEights, envelope, notTurn, { type: "draw" }, env);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe("not_your_turn");

    const hand = state.hands[state.turn]!;
    const illegal = hand.find(
      (c) => !c.startsWith("8") && c.slice(-1) !== state.activeSuit && c.slice(0, -1) !== state.discard[0]!.slice(0, -1),
    );
    if (illegal) {
      const r2 = submitAction(crazyEights, envelope, state.turn, { type: "play", card: illegal }, env);
      expect(r2.ok).toBe(false);
    }
    const r3 = submitAction(crazyEights, envelope, state.turn, { type: "play", card: "notacard" }, env);
    expect(r3.ok).toBe(false);
    const stolen = state.hands[notTurn]![0]!;
    const r4 = submitAction(crazyEights, envelope, state.turn, { type: "play", card: stolen }, env);
    expect(r4.ok).toBe(false);
  });

  it("requires drawing before passing, then allows passing", () => {
    const { envelope, env } = start(crazyEights, 2);
    const turn = S(envelope).turn;
    expect(submitAction(crazyEights, envelope, turn, { type: "pass" }, env).ok).toBe(false);
    const drawn = act(crazyEights, envelope, turn, { type: "draw" }, env);
    expect(S(drawn).hands[turn]).toHaveLength(8);
    expect(submitAction(crazyEights, drawn, turn, { type: "draw" }, env).ok).toBe(false);
    const passed = act(crazyEights, drawn, turn, { type: "pass" }, env);
    expect(S(passed).turn).not.toBe(turn);
  });

  it("requires a suit choice for eights and applies it", () => {
    const { envelope, env } = start(crazyEights, 2);
    const s = S(envelope);
    const turn = s.turn;
    const hand = ["8H", ...s.hands[turn]!.filter((c) => c !== "8H")];
    const forced = { ...envelope, state: { ...s, hands: { ...s.hands, [turn]: hand } } };
    expect(submitAction(crazyEights, forced, turn, { type: "play", card: "8H" }, env).ok).toBe(false);
    const played = act(crazyEights, forced, turn, { type: "play", card: "8H", suit: "C" }, env);
    expect(S(played).activeSuit).toBe("C");
    expect(S(played).discard.at(-1)).toBe("8H");
  });

  it("scores the round for the player who goes out", () => {
    const { envelope, env, players } = start(crazyEights, 2, { rounds: 2, targetScore: 500 });
    const s = S(envelope);
    const turn = s.turn;
    const other = players.find((p) => p !== turn)!;
    const forced = {
      ...envelope,
      state: { ...s, hands: { [turn]: ["8S"], [other]: ["KH", "3D", "8C"] } },
    };
    const done = act(crazyEights, forced, turn, { type: "play", card: "8S", suit: "H" }, env);
    const st = S(done);
    expect(st.phase).toBe("roundEnd");
    expect(st.scores[turn]).toBe(10 + 3 + 50);
    expect(st.summaries).toHaveLength(1);
    // Host continues to round 2
    const next = act(crazyEights, done, players[0]!, { type: "next" }, env);
    expect(S(next).round).toBe(2);
    expect(S(next).scores[turn]).toBe(63);
  });

  it("auto-plays when the turn timer expires", () => {
    const { envelope, env } = start(crazyEights, 3, { turnSeconds: 10 });
    const turn = S(envelope).turn;
    const later = advance(crazyEights, envelope, { ...env, autopilot: new Set(), now: env.now + 11_000 });
    expect(S(later).turn).not.toBe(turn);
  });

  it("deduplicates nothing itself but stays consistent: card count is conserved", () => {
    simulate(
      crazyEights,
      4,
      { rounds: 2 },
      {
        onStep: (e) => {
          const s = S(e);
          if (s.phase !== "play") return;
          const total = s.drawPile.length + s.discard.length + Object.values(s.hands).reduce((n, h) => n + h.length, 0);
          expect(total).toBe(52);
        },
      },
    );
  });

  it.each([2, 3, 5, 7])("completes a full simulated match with %i players and keeps hands private", (n) => {
    const { envelope, env } = simulate(crazyEights, n, { rounds: 2 }, { checkPrivacy: true });
    expect(crazyEights.isOver(S(envelope))).toBe(true);
    const results = crazyEights.results(S(envelope), { ...env, config: envelope.config });
    expect(results.standings).toHaveLength(n);
    expect(results.standings[0]!.place).toBe(1);
    assertPrivacy(crazyEights, envelope, env);
  });
});
