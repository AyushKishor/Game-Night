import { createSheddingGame } from "../shared/shedding";

export const crazyEights = createSheddingGame(
  {
    id: "crazy-eights",
    name: "Crazy Eights",
    tagline: "Match the suit or rank. Eights are wild.",
    category: "card",
    minPlayers: 2,
    maxPlayers: 7,
    duration: "10–20 min",
    icon: "Layers",
    accent: "coral",
    supportsBots: true,
    rules: {
      goal: "Be the first to get rid of all your cards.",
      steps: [
        "Everyone gets 5 cards (7 with two players). One card starts the discard pile.",
        "On your turn, play a card that matches the top card's suit or rank.",
        "Eights are wild: play one any time and choose the next suit.",
        "Can't or don't want to play? Draw one card. You may then play a legal card or pass.",
        "When the draw pile runs out, the discard pile is reshuffled (the top card stays).",
      ],
      scoring:
        "The player who goes out scores the cards left in everyone else's hands: eights 50, face cards 10, aces 1, other cards their number.",
      ending:
        "The game ends after the set number of rounds or when someone reaches the target score. Highest total wins; equal totals share the win.",
    },
  },
  { wildRank: "8", handSize: (n) => (n === 2 ? 7 : 5) },
  {
    quick: { rounds: 1, targetScore: 50, turnSeconds: 20 },
    standard: { rounds: 3, targetScore: 100, turnSeconds: 30 },
    long: { rounds: 6, targetScore: 200, turnSeconds: 45 },
  },
);
