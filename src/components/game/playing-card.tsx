"use client";
import { motion } from "framer-motion";
import { type CardId, SUIT_SYMBOLS, cardName, rankOf, suitOf } from "@/lib/engine/cards";
import { useSettings } from "@/lib/client/settings";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "w-9 h-13 text-[0.7rem] rounded-md",
  sm: "w-12 h-17 text-sm rounded-lg",
  md: "w-16 h-23 text-base rounded-xl",
  lg: "w-22 h-31 text-xl rounded-xl",
  xl: "w-28 h-40 text-2xl rounded-2xl",
} as const;
export type CardSize = keyof typeof SIZES;

function suitColor(card: CardId, highContrast: boolean) {
  const s = suitOf(card);
  if (highContrast) {
    return { S: "text-card-black", H: "text-card-red", D: "text-card-blue", C: "text-card-green" }[s];
  }
  return s === "H" || s === "D" ? "text-card-red" : "text-card-black";
}

export function CardFace({ card, size = "md", className }: { card: CardId; size?: CardSize; className?: string }) {
  const highContrast = useSettings((s) => s.highContrast);
  const rank = rankOf(card);
  const sym = SUIT_SYMBOLS[suitOf(card)];
  return (
    <span
      className={cn(
        "bg-card-face font-display shadow-card relative flex shrink-0 flex-col leading-none font-extrabold ring-1 ring-black/10 select-none",
        SIZES[size],
        suitColor(card, highContrast),
        highContrast && "ring-2 ring-black",
        className,
      )}
      aria-hidden
    >
      <span className="absolute top-[6%] left-[8%] flex flex-col items-center">
        <span>{rank}</span>
        <span className="text-[0.85em]">{sym}</span>
      </span>
      <span className="m-auto text-[1.9em]">{sym}</span>
      <span className="absolute right-[8%] bottom-[6%] flex rotate-180 flex-col items-center">
        <span>{rank}</span>
        <span className="text-[0.85em]">{sym}</span>
      </span>
    </span>
  );
}

export function CardBack({ size = "md", className, label }: { size?: CardSize; className?: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "border-card-face/90 shadow-card relative flex shrink-0 items-center justify-center overflow-hidden border-2 bg-[#28356a]",
        "bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.07)_0_6px,transparent_6px_12px)]",
        SIZES[size],
        className,
      )}
    >
      <span className="border-amber/70 size-[45%] rounded-full border-2" />
    </span>
  );
}

export interface PlayingCardProps {
  card: CardId;
  size?: CardSize;
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  /** Extra text appended to the accessible label, e.g. "playable". */
  hint?: string;
}

export function PlayingCard({ card, size = "md", selected, playable, disabled, onClick, className, hint }: PlayingCardProps) {
  const label = `${cardName(card)}${hint ? `, ${hint}` : ""}${selected ? ", selected" : ""}`;
  if (!onClick) {
    return (
      <span role="img" aria-label={label} className={cn("inline-flex", className)}>
        <CardFace card={card} size={size} />
      </span>
    );
  }
  return (
    <motion.button
      type="button"
      layout
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: selected ? -14 : 0, opacity: 1 }}
      whileHover={disabled ? undefined : { y: selected ? -18 : -6 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "relative shrink-0 rounded-xl disabled:cursor-not-allowed",
        playable && !disabled && "after:bg-mint after:absolute after:inset-x-2 after:-bottom-2 after:h-1 after:rounded-full",
        disabled && "opacity-55 saturate-50",
        selected && "drop-shadow-[0_0_10px_rgba(76,201,240,0.75)]",
        className,
      )}
    >
      <CardFace card={card} size={size} className={selected ? "ring-sky ring-4" : undefined} />
    </motion.button>
  );
}

/** A pile of face-down cards with a count. */
export function DeckPile({ count, size = "md", label = "Draw pile" }: { count: number; size?: CardSize; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {count > 0 ? (
        <span className="relative">
          {count > 2 && <CardBack size={size} className="absolute top-1 left-1 opacity-60" />}
          <CardBack size={size} label={`${label}, ${count} cards`} />
        </span>
      ) : (
        <span
          className={cn("border-border text-muted flex items-center justify-center border-2 border-dashed text-xs", SIZES[size])}
        >
          Empty
        </span>
      )}
      <span className="text-muted text-xs font-semibold">
        {label} · {count}
      </span>
    </div>
  );
}
