import { createSheddingGame } from "../shared/shedding";

export const switchGame = createSheddingGame(
  {
    id: "switch",
    name: "Switch",
    tagline: "Shedding with action cards: pick-up twos, skips and reverses.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 7,
    duration: "10–20 min",
    icon: "Repeat",
    accent: "violet",
    supportsBots: true,
    rules: {
      goal: "Be the first to get rid of all your cards.",
      steps: [
        "Everyone gets 7 cards (5 with five or more players). Match the top card's suit or rank.",
        "Aces are wild: play one on anything and choose the next suit.",
        "Twos: the next player must draw 2 — unless they play a Two, which passes on 4, and so on.",
        "Eights: the next player misses their turn.",
        "Jacks: reverse the direction of play (no effect with two players).",
        "If you can't play, draw one card, then play a legal card or pass.",
      ],
      scoring:
        "The player who goes out scores the cards left in other hands: aces 50, twos/eights/jacks 20, queens and kings 10, others their number.",
      ending:
        "Ends after the set number of rounds or when someone reaches the target score. Highest total wins; ties share the win.",
    },
  },
  { wildRank: "A", drawTwoRank: "2", skipRank: "8", reverseRank: "J", handSize: (n) => (n >= 5 ? 5 : 7) },
  {
    quick: { rounds: 1, targetScore: 60, turnSeconds: 20 },
    standard: { rounds: 3, targetScore: 150, turnSeconds: 30 },
    long: { rounds: 6, targetScore: 300, turnSeconds: 45 },
  },
);
