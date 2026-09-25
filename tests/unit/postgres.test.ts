import { afterAll, describe, expect, it } from "vitest";
import { PostgresStore } from "@/lib/server/pg-store";
import { RoomService } from "@/lib/server/rooms";
import type { Command } from "@/lib/shared/protocol";
import type { SheddingPrivate, SheddingPublic } from "@/games/shared/shedding";

/**
 * Runs the authoritative room flow against a real Postgres database.
 * Set TEST_DATABASE_URL (migrations applied) to enable, e.g.
 * TEST_DATABASE_URL=postgres://gamenight:gamenight@localhost:5432/gamenight_test
 */
const url = process.env.TEST_DATABASE_URL;
let n = 0;
const id = () => `pg-action-${Date.now()}-${++n}`;

describe.skipIf(!url)("Postgres store", () => {
  const store = url ? new PostgresStore(url) : (null as unknown as PostgresStore);
  const svc = new RoomService({ store, botDelayMs: 0 });
  afterAll(async () => store?.end());

  it("persists rooms, sessions and game state; serialises concurrent actions", async () => {
    const host = await svc.createRoom({ name: "PgHost" });
    const code = host.room.code;
    const guest = await svc.join(code, { name: "PgGuest" });
    const cmd = (token: string, c: Record<string, unknown>) => svc.command(code, token, { actionId: id(), ...c } as Command);
    await cmd(host.token, { kind: "selectGame", gameId: "crazy-eights" });
    await cmd(guest.token, { kind: "ready", ready: true });
    const started = await cmd(host.token, { kind: "start" });
    const turn = (started.room.game!.publicState as SheddingPublic).turn;
    const turnToken = turn === host.me.playerId ? host.token : guest.token;

    const results = await Promise.allSettled([
      cmd(turnToken, { kind: "game", action: { type: "draw" } }),
      cmd(turnToken, { kind: "game", action: { type: "draw" } }),
      cmd(turnToken, { kind: "game", action: { type: "draw" } }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // A fresh service (like another serverless instance) sees the same state.
    const other = new RoomService({ store, botDelayMs: 0 });
    const s = await other.sync(code, guest.token);
    expect((s.me.private as SheddingPrivate).hand.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.room)).not.toContain('"hands"');
  });

  it("rejects unknown tokens and cleans up idle rooms", async () => {
    const host = await svc.createRoom({ name: "Idle" });
    await expect(svc.sync(host.room.code, "bad-token")).rejects.toMatchObject({ status: 401 });
    const later = new RoomService({ store, now: () => Date.now() + 10 * 60 * 60_000, roomIdleMs: 60_000 });
    expect(await later.cleanup()).toBeGreaterThanOrEqual(1);
    expect(await store.getRoom(host.room.code)).toBeNull();
  });
});
