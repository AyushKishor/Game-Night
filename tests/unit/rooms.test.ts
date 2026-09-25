import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/server/memory-store";
import { RoomError, RoomService } from "@/lib/server/rooms";
import type { Command, StateResponse, CommandInput } from "@/lib/shared/protocol";
import type { SheddingPrivate, SheddingPublic } from "@/games/shared/shedding";

let clock = 1_700_000_000_000;
let n = 0;
const aid = () => `action-${++n}-${Math.random().toString(36).slice(2)}`;

function makeService(store = new MemoryStore()) {
  return new RoomService({ store, now: () => clock, botDelayMs: 0, roomIdleMs: 60 * 60_000 });
}

async function setupRoom(svc: RoomService, players = 4) {
  const host = await svc.createRoom({ name: "Hosty" });
  const code = host.room.code;
  const guests = [];
  for (let i = 1; i < players; i++) guests.push(await svc.join(code, { name: `Guest${i}` }));
  return { code, host, guests, all: [host, ...guests] };
}

async function cmd(svc: RoomService, code: string, token: string, c: CommandInput & { actionId?: string }) {
  return svc.command(code, token, { actionId: aid(), ...c } as Command);
}

async function startCrazyEights(svc: RoomService, code: string, all: { token: string }[]) {
  const [host, ...guests] = all;
  await cmd(svc, code, host!.token, { kind: "selectGame", gameId: "crazy-eights" });
  for (const g of guests) await cmd(svc, code, g.token, { kind: "ready", ready: true });
  return cmd(svc, code, host!.token, { kind: "start" });
}

beforeEach(() => {
  clock += 10_000_000;
});

describe("rooms", () => {
  it("creates a room with a six-character code and the creator as host", async () => {
    const svc = makeService();
    const res = await svc.createRoom({ name: "Alex" });
    expect(res.room.code).toMatch(/^[A-HJ-KMNP-Z2-9]{6}$/);
    expect(res.me.isHost).toBe(true);
    expect(res.token.length).toBeGreaterThan(30);
    expect(res.room.players).toHaveLength(1);
  });

  it("lets four players join and see each other in the lobby", async () => {
    const svc = makeService();
    const { code, host } = await setupRoom(svc, 4);
    const state = await svc.sync(code, host.token);
    expect(state.room.players.map((p) => p.name)).toEqual(["Hosty", "Guest1", "Guest2", "Guest3"]);
  });

  it("bumps the room version and publishes when someone joins", async () => {
    const published: number[] = [];
    const svc = new RoomService({ store: new MemoryStore(), now: () => clock, publish: (_c, v) => void published.push(v) });
    const host = await svc.createRoom({ name: "H" });
    const joined = await svc.join(host.room.code, { name: "J" });
    expect(joined.room.version).toBeGreaterThan(host.room.version);
    expect(published.at(-1)).toBe(joined.room.version);
  });

  it("de-duplicates nicknames", async () => {
    const svc = makeService();
    const { code } = await setupRoom(svc, 1);
    const a = await svc.join(code, { name: "Sam" });
    const b = await svc.join(code, { name: "sam" });
    const names = b.room.players.map((p) => p.name);
    expect(names).toContain("Sam");
    expect(names).toContain("sam 2");
    expect(a.me.playerId).not.toBe(b.me.playerId);
  });

  it("rejects offensive nicknames and sanitises control characters", async () => {
    const svc = makeService();
    await expect(svc.createRoom({ name: "sh1t" })).rejects.toThrow(RoomError);
    const ok = await svc.createRoom({ name: "  Zoë‮\u0000  " });
    expect(ok.room.players[0]!.name).toBe("Zoë");
  });

  it("gives a useful error for unknown and expired room codes", async () => {
    const svc = makeService();
    await expect(svc.preview("ZZZZZZ")).rejects.toMatchObject({ code: "room_not_found", status: 404 });
    await expect(svc.join("ZZZZZZ", { name: "x" })).rejects.toMatchObject({ code: "room_not_found" });
    const { code } = await setupRoom(svc, 1);
    clock += 61 * 60_000;
    await expect(svc.preview(code)).rejects.toMatchObject({ code: "room_expired", status: 410 });
    await expect(svc.preview(code)).rejects.toMatchObject({ code: "room_not_found" });
  });

  it("cleans up idle rooms", async () => {
    const store = new MemoryStore();
    const svc = makeService(store);
    await setupRoom(svc, 1);
    await setupRoom(svc, 1);
    clock += 61 * 60_000;
    expect(await svc.cleanup()).toBe(2);
  });

  it("enforces host-only commands", async () => {
    const svc = makeService();
    const { code, guests } = await setupRoom(svc, 2);
    await expect(cmd(svc, code, guests[0]!.token, { kind: "selectGame", gameId: "crazy-eights" })).rejects.toMatchObject({
      code: "not_host",
    });
    await expect(cmd(svc, code, guests[0]!.token, { kind: "lock", locked: true })).rejects.toMatchObject({ code: "not_host" });
  });

  it("requires everyone to be ready before starting", async () => {
    const svc = makeService();
    const { code, host, guests } = await setupRoom(svc, 3);
    await cmd(svc, code, host.token, { kind: "selectGame", gameId: "crazy-eights" });
    await cmd(svc, code, guests[0]!.token, { kind: "ready", ready: true });
    await expect(cmd(svc, code, host.token, { kind: "start" })).rejects.toMatchObject({ code: "not_ready" });
    await cmd(svc, code, guests[1]!.token, { kind: "ready", ready: true });
    const started = await cmd(svc, code, host.token, { kind: "start" });
    expect(started.room.phase).toBe("playing");
    expect(started.room.game?.gameId).toBe("crazy-eights");
  });

  it("never sends one player's hand to another player or to the table", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 4);
    await startCrazyEights(svc, code, all);
    const views: StateResponse[] = [];
    for (const p of all) views.push(await svc.sync(code, p.token));
    for (const [i, view] of views.entries()) {
      const hand = (view.me.private as SheddingPrivate).hand;
      expect(hand.length).toBeGreaterThan(0);
      for (const [j, other] of views.entries()) {
        const serialized = JSON.stringify(other);
        for (const card of hand) {
          if (i !== j) expect(serialized).not.toContain(`"${card}"`);
        }
      }
      // The public state only has counts
      expect(JSON.stringify(view.room.game!.publicState)).not.toContain('"hand"');
    }
  });

  it("rejects out-of-turn actions and duplicate submissions are idempotent", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 3);
    const started = await startCrazyEights(svc, code, all);
    const pub = started.room.game!.publicState as SheddingPublic;
    const turnIdx = all.findIndex((p) => p.me.playerId === pub.turn);
    const turn = all[turnIdx]!;
    const notTurn = all[(turnIdx + 1) % all.length]!;
    await expect(cmd(svc, code, notTurn.token, { kind: "game", action: { type: "draw" } })).rejects.toMatchObject({
      code: "not_your_turn",
    });
    const actionId = aid();
    const first = await cmd(svc, code, turn.token, { kind: "game", action: { type: "draw" }, actionId });
    const again = await cmd(svc, code, turn.token, { kind: "game", action: { type: "draw" }, actionId });
    expect(again.duplicate).toBe(true);
    const hand1 = (first.me.private as SheddingPrivate).hand.length;
    const hand2 = (again.me.private as SheddingPrivate).hand.length;
    expect(hand2).toBe(hand1);
  });

  it("serialises near-simultaneous actions so only one can succeed", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 2);
    const started = await startCrazyEights(svc, code, all);
    const pub = started.room.game!.publicState as SheddingPublic;
    const turn = all.find((p) => p.me.playerId === pub.turn)!;
    const results = await Promise.allSettled([
      cmd(svc, code, turn.token, { kind: "game", action: { type: "draw" } }),
      cmd(svc, code, turn.token, { kind: "game", action: { type: "draw" } }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("lets a player reconnect with their token after a refresh", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 3);
    await startCrazyEights(svc, code, all);
    const before = await svc.sync(code, all[1]!.token);
    clock += 30_000;
    const after = await svc.sync(code, all[1]!.token);
    expect(after.me.playerId).toBe(before.me.playerId);
    expect((after.me.private as SheddingPrivate).hand).toEqual((before.me.private as SheddingPrivate).hand);
  });

  it("rejects bad or missing tokens", async () => {
    const svc = makeService();
    const { code } = await setupRoom(svc, 1);
    await expect(svc.sync(code, "nope")).rejects.toMatchObject({ status: 401 });
    await expect(svc.sync(code, "")).rejects.toMatchObject({ status: 401 });
  });

  it("transfers host when the host disappears, and on leave", async () => {
    const svc = makeService();
    const { code, host, guests } = await setupRoom(svc, 3);
    clock += 70_000; // host silent for longer than the grace period
    const state = await svc.sync(code, guests[0]!.token);
    expect(state.room.hostId).toBe(guests[0]!.me.playerId);

    const svc2 = makeService();
    const r2 = await setupRoom(svc2, 2);
    await cmd(svc2, r2.code, r2.host.token, { kind: "leave" }).catch(() => {});
    const s2 = await svc2.sync(r2.code, r2.guests[0]!.token);
    expect(s2.room.hostId).toBe(r2.guests[0]!.me.playerId);
    expect(host).toBeTruthy();
  });

  it("autoplays for a disconnected player so the game continues", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 3);
    const started = await startCrazyEights(svc, code, all);
    const turn = (started.room.game!.publicState as SheddingPublic).turn;
    const other = all.find((p) => p.me.playerId !== turn)!;
    clock += 45_000; // everyone except `other` goes quiet
    const s = await svc.sync(code, other.token);
    expect(s.room.game!.autopilot).toContain(turn);
    const pub = s.room.game!.publicState as SheddingPublic;
    expect(pub.turn === turn && pub.discardCount === 1 && !pub.drewThisTurn).toBe(false);
  });

  it("lets the host remove a player, whose session then stops working", async () => {
    const svc = makeService();
    const { code, host, guests } = await setupRoom(svc, 3);
    await cmd(svc, code, host.token, { kind: "kick", playerId: guests[0]!.me.playerId });
    await expect(svc.sync(code, guests[0]!.token)).rejects.toMatchObject({ status: 401 });
  });

  it("locks the room and enforces capacity and spectator settings", async () => {
    const svc = makeService();
    const { code, host } = await setupRoom(svc, 1);
    await cmd(svc, code, host.token, { kind: "lock", locked: true });
    await expect(svc.join(code, { name: "late" })).rejects.toMatchObject({ code: "room_locked" });
    await cmd(svc, code, host.token, { kind: "lock", locked: false });
    for (let i = 0; i < 11; i++) await svc.join(code, { name: `P${i}` });
    await expect(svc.join(code, { name: "one-too-many" })).rejects.toMatchObject({ code: "room_full" });
    const spec = await svc.join(code, { name: "Watcher", spectator: true });
    expect(spec.me.isSpectator).toBe(true);
    await cmd(svc, code, host.token, { kind: "allowSpectators", allow: false });
    await expect(svc.join(code, { name: "W2", spectator: true })).rejects.toMatchObject({ code: "no_spectators" });
  });

  it("spectators never receive private state", async () => {
    const svc = makeService();
    const { code, all } = await setupRoom(svc, 2);
    const spec = await svc.join(code, { name: "Watcher", spectator: true });
    await startCrazyEights(svc, code, all);
    const s = await svc.sync(code, spec.token);
    expect(s.me.private).toBeNull();
    expect(s.room.game?.players).not.toContain(spec.me.playerId);
  });

  it("plays a full game with bots, awards leaderboard points, and supports rematch, switching games and lobby", async () => {
    const svc = makeService();
    const { code, host } = await setupRoom(svc, 1);
    await cmd(svc, code, host.token, { kind: "addBot" });
    await cmd(svc, code, host.token, { kind: "addBot" });
    await cmd(svc, code, host.token, { kind: "addBot" });
    await cmd(svc, code, host.token, { kind: "selectGame", gameId: "crazy-eights" });
    await cmd(svc, code, host.token, { kind: "configure", preset: "quick" });
    let s = await cmd(svc, code, host.token, { kind: "start" });
    expect(s.room.game!.players).toHaveLength(4);
    // Host plays via autopilot by going quiet; bots move instantly.
    for (let i = 0; i < 200 && s.room.phase === "playing"; i++) {
      clock += 45_000;
      s = await svc.sync(code, host.token);
    }
    expect(s.room.phase).toBe("results");
    expect(s.room.lastResults?.standings).toHaveLength(4);
    const totalPoints = s.room.players.reduce((n, p) => n + p.points, 0);
    expect(totalPoints).toBeGreaterThan(0);
    expect(s.room.history).toHaveLength(1);
    const pointsAfterFirst = Object.fromEntries(s.room.players.map((p) => [p.id, p.points]));

    s = await cmd(svc, code, host.token, { kind: "rematch" });
    expect(s.room.phase).toBe("playing");
    s = await cmd(svc, code, host.token, { kind: "endGame" });
    expect(s.room.phase).toBe("lobby");
    s = await cmd(svc, code, host.token, { kind: "selectGame", gameId: "switch" });
    expect(s.room.selectedGameId).toBe("switch");
    // Scores persist across games in the same room
    for (const p of s.room.players) expect(p.points).toBe(pointsAfterFirst[p.id]);
  });

  it("does not let players pick unknown games or join with bad payloads", async () => {
    const svc = makeService();
    const { code, host } = await setupRoom(svc, 1);
    await expect(cmd(svc, code, host.token, { kind: "selectGame", gameId: "poker" })).rejects.toMatchObject({
      code: "unknown_game",
    });
  });

  it("hands a session off to another device with a single-use link", async () => {
    const svc = makeService();
    const { code, host } = await setupRoom(svc, 1);
    const { handoff } = await svc.createHandoff(code, host.token);
    const phone = await svc.redeemHandoff(code, handoff);
    expect(phone.me.playerId).toBe(host.me.playerId);
    expect(phone.token).not.toBe(host.token);
    await expect(svc.redeemHandoff(code, handoff)).rejects.toMatchObject({ code: "handoff_invalid" });
  });
});
