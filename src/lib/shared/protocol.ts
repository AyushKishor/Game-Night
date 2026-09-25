import { z } from "zod";
import type { GameConfig, PlayerId, RoundSummary, Standing } from "@/lib/engine/types";

/** Wire protocol shared by API routes and the client. */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 20;

export const AVATARS = ["🦊", "🦉", "🐱", "🐶", "🐼", "🐸", "🐙", "🦄", "🐢", "🐧", "🚀", "⭐", "🌵", "🍩", "🎸", "🎈"] as const;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH, "Room codes are 6 characters")
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`), "That doesn't look like a room code");

export const nicknameSchema = z.string().min(1, "Enter a nickname").max(40);
export const avatarSchema = z.enum(AVATARS);

export const createRoomSchema = z.object({
  name: nicknameSchema,
  avatar: avatarSchema.optional(),
});

export const joinRoomSchema = z.object({
  name: nicknameSchema,
  avatar: avatarSchema.optional(),
  spectator: z.boolean().optional(),
});

export const configPatchSchema = z
  .object({
    rounds: z.number().int().min(1).max(30),
    targetScore: z.number().int().min(10).max(1000),
    turnSeconds: z.number().int().min(0).max(300),
    roundSeconds: z.number().int().min(0).max(600),
    difficulty: z.enum(["easy", "normal", "hard"]),
    teamMode: z.boolean(),
    familyFriendly: z.boolean(),
    allowJoinInProgress: z.boolean(),
    houseRules: z.record(z.string().max(40), z.boolean()),
  })
  .partial();

const actionId = z.string().min(8).max(64);

export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), actionId, ready: z.boolean() }),
  z.object({ kind: z.literal("selectGame"), actionId, gameId: z.string().max(40) }),
  z.object({
    kind: z.literal("configure"),
    actionId,
    preset: z.enum(["quick", "standard", "long"]).optional(),
    config: configPatchSchema.optional(),
  }),
  z.object({ kind: z.literal("start"), actionId }),
  z.object({ kind: z.literal("game"), actionId, action: z.unknown() }),
  z.object({ kind: z.literal("kick"), actionId, playerId: z.string().max(64) }),
  z.object({ kind: z.literal("lock"), actionId, locked: z.boolean() }),
  z.object({ kind: z.literal("allowSpectators"), actionId, allow: z.boolean() }),
  z.object({ kind: z.literal("addBot"), actionId }),
  z.object({ kind: z.literal("removeBot"), actionId, playerId: z.string().max(64) }),
  z.object({ kind: z.literal("rematch"), actionId }),
  z.object({ kind: z.literal("toLobby"), actionId }),
  z.object({ kind: z.literal("endGame"), actionId }),
  z.object({ kind: z.literal("transferHost"), actionId, playerId: z.string().max(64) }),
  z.object({ kind: z.literal("setSpectator"), actionId, spectator: z.boolean() }),
  z.object({ kind: z.literal("updateProfile"), actionId, name: nicknameSchema.optional(), avatar: avatarSchema.optional() }),
  z.object({ kind: z.literal("leave"), actionId }),
]);
export type Command = z.infer<typeof commandSchema>;
export type CommandKind = Command["kind"];

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  isSpectator: boolean;
  ready: boolean;
  connected: boolean;
  inGame: boolean;
  points: number;
  wins: number;
  gamesPlayed: number;
}

export interface GameSnapshot {
  gameId: string;
  players: PlayerId[];
  publicState: unknown;
  pending: PlayerId[];
  deadline: number | null;
  wakeAt: number | null;
  roundSummaries: RoundSummary[];
  startedAt: number;
  config: GameConfig;
  over: boolean;
  /** Players the server is currently playing for (bots / away). */
  autopilot: PlayerId[];
}

export interface GameResultSnapshot {
  gameId: string;
  standings: Standing[];
  summary: string;
  awarded: Record<PlayerId, number>;
  finishedAt: number;
}

export interface HistoryEntry {
  gameId: string;
  finishedAt: number;
  winners: string[];
}

export type RoomPhase = "lobby" | "playing" | "results";

export interface RoomSnapshot {
  code: string;
  channel: string;
  version: number;
  phase: RoomPhase;
  hostId: PlayerId;
  locked: boolean;
  allowSpectators: boolean;
  selectedGameId: string | null;
  preset: "quick" | "standard" | "long" | "custom";
  config: GameConfig;
  players: PublicPlayer[];
  game: GameSnapshot | null;
  lastResults: GameResultSnapshot | null;
  history: HistoryEntry[];
  log: { t: number; text: string }[];
  expiresAt: number;
  serverNow: number;
  /** Names of players who have left but still appear in results. */
  formerNames: Record<PlayerId, string>;
}

export interface MeSnapshot {
  playerId: PlayerId;
  isHost: boolean;
  isSpectator: boolean;
  /** This player's secret game information. Never another player's. */
  private: unknown;
}

export interface StateResponse {
  room: RoomSnapshot;
  me: MeSnapshot;
}

export interface SessionResponse extends StateResponse {
  token: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface RoomPreview {
  code: string;
  exists: true;
  phase: RoomPhase;
  locked: boolean;
  full: boolean;
  allowSpectators: boolean;
  playerCount: number;
  hostName: string;
  gameName: string | null;
}

/** A command before the client stamps it with an action ID. */
export type CommandInput = Command extends infer C ? (C extends unknown ? Omit<C, "actionId"> : never) : never;
