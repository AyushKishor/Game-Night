import type { GameSnapshot, MeSnapshot, RoomSnapshot } from "@/lib/shared/protocol";

export type ViewMode = "table" | "hand";

export interface GameViewProps<P = unknown, V = unknown> {
  pub: P;
  priv: V | null;
  mode: ViewMode;
  room: RoomSnapshot;
  game: GameSnapshot;
  me: MeSnapshot;
  names: Record<string, string>;
  send: (action: object) => Promise<boolean>;
}
