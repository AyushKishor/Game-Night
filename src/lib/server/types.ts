import type { GameEnvelope } from "@/lib/engine/runner";
import type { GameConfig, PlayerId } from "@/lib/engine/types";
import type { GameResultSnapshot, HistoryEntry, RoomPhase } from "@/lib/shared/protocol";

/** Server-side room document. Contains secrets; never serialise to clients. */
export interface PlayerRecord {
  id: PlayerId;
  name: string;
  avatar: string;
  isBot: boolean;
  isSpectator: boolean;
  ready: boolean;
  joinedAt: number;
  lastSeen: number;
  points: number;
  wins: number;
  gamesPlayed: number;
}

export interface RoomDoc {
  id: string;
  code: string;
  createdAt: number;
  /** Last meaningful activity — drives idle expiry. */
  activeAt: number;
  version: number;
  hostId: PlayerId;
  locked: boolean;
  allowSpectators: boolean;
  players: PlayerRecord[];
  formerNames: Record<PlayerId, string>;
  phase: RoomPhase;
  selectedGameId: string | null;
  preset: "quick" | "standard" | "long" | "custom";
  config: GameConfig;
  game: GameEnvelope | null;
  recordedRounds: number;
  lastResults: GameResultSnapshot | null;
  history: HistoryEntry[];
  log: { t: number; text: string }[];
  /** Recently processed client action IDs, for idempotency. */
  recentActionIds: string[];
  handoffs: { codeHash: string; playerId: PlayerId; expiresAt: number }[];
  botCounter: number;
}

export interface SessionRecord {
  tokenHash: string;
  roomId: string;
  playerId: PlayerId;
  expiresAt: number;
}

export interface RoundRecord {
  roomId: string;
  gameId: string;
  round: number;
  summary: unknown;
  createdAt: number;
}

export type MutateResult<T> = { room: RoomDoc | null; result: T; changed: boolean };

export interface RoomStore {
  readonly kind: "memory" | "postgres";
  /** Insert a new room. Returns false if the code is already taken. */
  insertRoom(room: RoomDoc): Promise<boolean>;
  getRoom(code: string): Promise<RoomDoc | null>;
  /**
   * Serialised read-modify-write of a room. The callback runs while holding
   * an exclusive lock (row lock in Postgres), so concurrent actions can never
   * interleave. Returning `room: null` deletes the room.
   */
  mutateRoom<T>(
    code: string,
    fn: (room: RoomDoc) => MutateResult<T>,
  ): Promise<{ found: false } | { found: true; result: T; room: RoomDoc | null; changed: boolean }>;
  insertSession(session: SessionRecord): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSessions(roomId: string, playerId: PlayerId): Promise<void>;
  insertRounds(rounds: RoundRecord[]): Promise<void>;
  /** Delete rooms idle since before `cutoff` and expired sessions. Returns rooms removed. */
  cleanup(cutoff: number, now: number): Promise<number>;
}
