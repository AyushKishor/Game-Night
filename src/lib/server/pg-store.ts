import postgres from "postgres";
import type { MutateResult, RoomDoc, RoomStore, RoundRecord, SessionRecord } from "./types";

/**
 * Postgres-backed store (Supabase Postgres in production).
 *
 * Rooms are stored as a JSONB document plus indexed columns. Mutations run
 * inside a transaction holding `SELECT … FOR UPDATE`, which serialises
 * concurrent actions on the same room across all server instances.
 */
export class PostgresStore implements RoomStore {
  readonly kind = "postgres" as const;
  private sql: postgres.Sql;

  constructor(url: string) {
    this.sql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }

  async insertRoom(room: RoomDoc) {
    const rows = await this.sql`
      insert into gn_rooms (id, code, doc, version, active_at, created_at)
      values (${room.id}, ${room.code}, ${this.sql.json(room as never)}, ${room.version},
              to_timestamp(${room.activeAt / 1000}), to_timestamp(${room.createdAt / 1000}))
      on conflict (code) do nothing
      returning id`;
    return rows.length === 1;
  }

  async getRoom(code: string) {
    const rows = await this.sql<{ doc: RoomDoc }[]>`select doc from gn_rooms where code = ${code}`;
    return rows[0]?.doc ?? null;
  }

  async mutateRoom<T>(code: string, fn: (room: RoomDoc) => MutateResult<T>) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ doc: RoomDoc }[]>`select doc from gn_rooms where code = ${code} for update`;
      const current = rows[0]?.doc;
      if (!current) return { found: false as const };
      const { room, result, changed } = fn(current);
      if (room === null) {
        await tx`delete from gn_rooms where id = ${current.id}`;
      } else if (changed) {
        await tx`
          update gn_rooms
          set doc = ${tx.json(room as never)}, version = ${room.version},
              active_at = to_timestamp(${room.activeAt / 1000}), updated_at = now()
          where id = ${room.id}`;
      }
      return { found: true as const, result, room, changed };
    }) as Promise<{ found: false } | { found: true; result: T; room: RoomDoc | null; changed: boolean }>;
  }

  async insertSession(s: SessionRecord) {
    await this.sql`
      insert into gn_sessions (token_hash, room_id, player_id, expires_at)
      values (${s.tokenHash}, ${s.roomId}, ${s.playerId}, to_timestamp(${s.expiresAt / 1000}))`;
  }

  async getSession(tokenHash: string) {
    const rows = await this.sql<{ room_id: string; player_id: string; expires_at: Date }[]>`
      select room_id, player_id, expires_at from gn_sessions
      where token_hash = ${tokenHash} and expires_at > now()`;
    const r = rows[0];
    return r ? { tokenHash, roomId: r.room_id, playerId: r.player_id, expiresAt: r.expires_at.getTime() } : null;
  }

  async deleteSessions(roomId: string, playerId: string) {
    await this.sql`delete from gn_sessions where room_id = ${roomId} and player_id = ${playerId}`;
  }

  async insertRounds(rounds: RoundRecord[]) {
    if (!rounds.length) return;
    await this.sql`
      insert into gn_round_summaries ${this.sql(
        rounds.map((r) => ({
          room_id: r.roomId,
          game_id: r.gameId,
          round: r.round,
          summary: JSON.stringify(r.summary),
        })),
      )}`;
  }

  async cleanup(cutoff: number, now: number) {
    const removed = await this.sql`delete from gn_rooms where active_at < to_timestamp(${cutoff / 1000}) returning id`;
    await this.sql`delete from gn_sessions where expires_at < to_timestamp(${now / 1000})`;
    return removed.length;
  }

  async end() {
    await this.sql.end({ timeout: 5 });
  }
}
