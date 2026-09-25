import type { MutateResult, RoomDoc, RoomStore, RoundRecord, SessionRecord } from "./types";

/**
 * In-process store for local development and tests. Every read returns a
 * deep copy so callers can never mutate stored state by accident.
 * Not suitable for multi-instance deployments — use Postgres there.
 */
export class MemoryStore implements RoomStore {
  readonly kind = "memory" as const;
  private rooms = new Map<string, RoomDoc>();
  private sessions = new Map<string, SessionRecord>();
  readonly rounds: RoundRecord[] = [];

  async insertRoom(room: RoomDoc) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }

  async getRoom(code: string) {
    const room = this.rooms.get(code);
    return room ? structuredClone(room) : null;
  }

  async mutateRoom<T>(code: string, fn: (room: RoomDoc) => MutateResult<T>) {
    const stored = this.rooms.get(code);
    if (!stored) return { found: false as const };
    // JS is single-threaded and `fn` is synchronous, so this block is atomic.
    const { room, result, changed } = fn(structuredClone(stored));
    if (room === null) {
      this.rooms.delete(code);
      for (const [k, s] of this.sessions) if (s.roomId === stored.id) this.sessions.delete(k);
    } else if (changed) {
      this.rooms.set(code, structuredClone(room));
    }
    return { found: true as const, result, room: room ? structuredClone(room) : null, changed };
  }

  async insertSession(session: SessionRecord) {
    this.sessions.set(session.tokenHash, { ...session });
  }

  async getSession(tokenHash: string) {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async deleteSessions(roomId: string, playerId: string) {
    for (const [k, s] of this.sessions) if (s.roomId === roomId && s.playerId === playerId) this.sessions.delete(k);
  }

  async insertRounds(rounds: RoundRecord[]) {
    this.rounds.push(...rounds);
  }

  async cleanup(cutoff: number, now: number) {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.activeAt < cutoff) {
        this.rooms.delete(code);
        removed++;
        for (const [k, s] of this.sessions) if (s.roomId === room.id) this.sessions.delete(k);
      }
    }
    for (const [k, s] of this.sessions) if (s.expiresAt < now) this.sessions.delete(k);
    return removed;
  }
}
