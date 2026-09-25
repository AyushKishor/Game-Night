import type { z } from "zod";
import type { Rng } from "./rng";
import type { ContentLibrary } from "@/content";

export type PlayerId = string;

export type Difficulty = "easy" | "normal" | "hard";

/** Host-configurable settings. Each game declares which keys are relevant. */
export interface GameConfig {
  rounds: number;
  targetScore: number;
  /** Seconds a player has for their turn. 0 disables the turn timer. */
  turnSeconds: number;
  /** Seconds for simultaneous-submission rounds (party games). 0 disables. */
  roundSeconds: number;
  difficulty: Difficulty;
  teamMode: boolean;
  familyFriendly: boolean;
  allowJoinInProgress: boolean;
  houseRules: Record<string, boolean>;
}

export type SettingKey = Exclude<keyof GameConfig, "houseRules">;

export type PresetId = "quick" | "standard" | "long";

export interface HouseRuleDef {
  key: string;
  label: string;
  description: string;
  default: boolean;
}

export interface GameRules {
  /** One-line goal. */
  goal: string;
  /** Short, ordered steps shown on the rules card. */
  steps: string[];
  scoring: string;
  /** How the game ends and how ties are broken. */
  ending: string;
}

export type GameCategory = "card" | "party";

export interface GameMeta {
  id: string;
  name: string;
  tagline: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  /** Human-readable duration estimate, e.g. "10–15 min". */
  duration: string;
  /** Lucide icon name used in the library. */
  icon: string;
  /** Accent colour token used by the UI. */
  accent: "coral" | "mint" | "sky" | "amber" | "violet" | "rose";
  rules: GameRules;
  /** Scores are penalties (Hearts, Golf). */
  lowerIsBetter?: boolean;
  supportsBots: boolean;
  supportsJoinInProgress?: boolean;
}

export interface GameContext {
  now: number;
  rng: Rng;
  config: GameConfig;
  content: ContentLibrary;
  hostId: PlayerId;
  names: Record<PlayerId, string>;
}

/** Context available to read-only selectors. */
export type ViewContext = Omit<GameContext, "rng">;

export interface Standing {
  playerId: PlayerId;
  score: number;
  /** 1-based placement; tied players share a place. */
  place: number;
}

export interface GameResults {
  standings: Standing[];
  summary: string;
}

export interface RoundSummary {
  round: number;
  title: string;
  lines: string[];
  scores: Record<PlayerId, number>;
  /** Sip mode: who takes a sip this round. Defaults to players who scored 0. */
  sips?: PlayerId[];
}

export interface GameModule<S = unknown, A extends { type: string } = { type: string }> {
  meta: GameMeta;
  settings: SettingKey[];
  houseRules?: HouseRuleDef[];
  presets: Record<PresetId, Partial<GameConfig>>;
  /** Zod schema that every inbound action for this game must satisfy. */
  actionSchema: z.ZodType<A>;

  setup(players: PlayerId[], ctx: GameContext): S;
  /** Returns a human-readable reason when the action is illegal, otherwise null. */
  validate(state: S, player: PlayerId, action: A, ctx: ViewContext): string | null;
  /** Pure state transition. Only called after `validate` returned null. */
  apply(state: S, player: PlayerId, action: A, ctx: GameContext): S;

  /** Players whose input the game is currently waiting for. */
  pending(state: S): PlayerId[];
  /** Epoch ms at which `onTimeout` should run, or null. */
  deadline(state: S): number | null;
  /** Called by the server when `deadline` passes. Must make progress. */
  onTimeout(state: S, ctx: GameContext): S;
  /** A legal action for an automated player (bots, idle or disconnected players). */
  botAction(state: S, player: PlayerId, ctx: GameContext): A | null;

  isOver(state: S): boolean;
  results(state: S, ctx: ViewContext): GameResults;
  roundSummaries(state: S): RoundSummary[];

  /** Everything every device (including the shared screen) may see. */
  publicView(state: S, ctx: ViewContext): unknown;
  /** Secret information for exactly one player. */
  privateView(state: S, player: PlayerId, ctx: ViewContext): unknown;

  /** Optional: add a late joiner to a game in progress. */
  addPlayer?(state: S, player: PlayerId, ctx: GameContext): S;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any>;
