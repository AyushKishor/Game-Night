import { type CardId, type Suit, rankValue, suitOf } from "@/lib/engine/cards";
import type { PlayerId } from "@/lib/engine/types";

/** Shared trick-taking helpers (Hearts, Spades). Aces are high. */
export interface TrickPlay {
  player: PlayerId;
  card: CardId;
}

export function trickWinner(trick: TrickPlay[], trump: Suit | null): TrickPlay {
  const lead = suitOf(trick[0]!.card);
  let best = trick[0]!;
  for (const play of trick.slice(1)) {
    const s = suitOf(play.card);
    const bs = suitOf(best.card);
    if (trump && s === trump && bs !== trump) best = play;
    else if (s === bs && rankValue(play.card, true) > rankValue(best.card, true)) best = play;
    else if (!trump && s === lead && bs !== lead) best = play;
  }
  return best;
}

/**
 * Legal cards for the next play.
 * - Must follow the led suit when possible.
 * - When leading, `restrictedLeadSuit` (hearts / spades) can't be led until
 *   broken, unless the hand has nothing else.
 */
export function legalTrickPlays(
  hand: CardId[],
  trick: TrickPlay[],
  opts: { restrictedLeadSuit: Suit; broken: boolean; mustLead?: CardId | null },
): CardId[] {
  if (trick.length === 0) {
    if (opts.mustLead && hand.includes(opts.mustLead)) return [opts.mustLead];
    if (!opts.broken) {
      const other = hand.filter((c) => suitOf(c) !== opts.restrictedLeadSuit);
      if (other.length) return other;
    }
    return hand.slice();
  }
  const lead = suitOf(trick[0]!.card);
  const follow = hand.filter((c) => suitOf(c) === lead);
  return follow.length ? follow : hand.slice();
}

export function lowest(cards: CardId[]): CardId {
  return cards.slice().sort((a, b) => rankValue(a, true) - rankValue(b, true))[0]!;
}

export function highest(cards: CardId[]): CardId {
  return cards.slice().sort((a, b) => rankValue(b, true) - rankValue(a, true))[0]!;
}

/** Cards in `options` that would currently win the trick. */
export function winningOptions(options: CardId[], trick: TrickPlay[], trump: Suit | null, player: PlayerId): CardId[] {
  if (trick.length === 0) return options;
  return options.filter((c) => trickWinner([...trick, { player, card: c }], trump).player === player);
}
