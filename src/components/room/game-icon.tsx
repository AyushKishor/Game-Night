import {
  ArrowUpDown,
  Crown,
  EyeOff,
  Fish,
  Flag,
  Ghost,
  Grid3x3,
  Heart,
  Layers,
  ListOrdered,
  MessageSquareQuote,
  Radio,
  Repeat,
  Spade,
  Swords,
  Target,
  Timer,
  Vote,
  Zap,
  Hash,
  type LucideIcon,
} from "lucide-react";
import type { GameMeta } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  ArrowUpDown,
  Crown,
  EyeOff,
  Fish,
  Flag,
  Ghost,
  Grid3x3,
  Heart,
  Layers,
  ListOrdered,
  MessageSquareQuote,
  Radio,
  Repeat,
  Spade,
  Swords,
  Target,
  Timer,
  Vote,
  Zap,
  Hash,
};

const ACCENTS: Record<GameMeta["accent"], string> = {
  coral: "bg-coral/15 text-coral",
  mint: "bg-mint/15 text-mint",
  sky: "bg-sky/15 text-sky",
  amber: "bg-amber/15 text-amber",
  violet: "bg-violet/15 text-violet",
  rose: "bg-rose/15 text-rose",
};

export function GameIcon({ game, className }: { game: Pick<GameMeta, "icon" | "accent">; className?: string }) {
  const Icon = ICONS[game.icon] ?? Spade;
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", ACCENTS[game.accent], className)} aria-hidden>
      <Icon className="size-6" />
    </span>
  );
}
