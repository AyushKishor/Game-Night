"use client";
import type { ComponentType } from "react";
import {
  BluffView,
  GoFishView,
  GolfView,
  HigherLowerView,
  MemoryView,
  OldMaidView,
  PresidentView,
  SevensView,
  SnapView,
  TwentyOneView,
  WarView,
} from "./card-views";
import { CaptionView } from "./caption-view";
import { ClueRushView } from "./clue-rush-view";
import { MajorityView } from "./majority-view";
import { MostLikelyView } from "./most-likely-view";
import { NhieView } from "./nhie-view";
import { QuickCategoriesView } from "./quick-categories-view";
import { QuizView } from "./quiz-view";
import { RankItView } from "./rank-it-view";
import { SecretSignalView } from "./secret-signal-view";
import { SheddingView } from "./shedding-view";
import { HeartsView, SpadesView } from "./trick-views";
import type { GameViewProps } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyView = ComponentType<GameViewProps<any, any>>;

export const GAME_VIEWS: Record<string, AnyView> = {
  "crazy-eights": SheddingView,
  switch: SheddingView,
  "go-fish": GoFishView,
  "old-maid": OldMaidView,
  war: WarView,
  snap: SnapView,
  memory: MemoryView,
  hearts: HeartsView,
  spades: SpadesView,
  president: PresidentView,
  bluff: BluffView,
  sevens: SevensView,
  golf: GolfView,
  "higher-lower": HigherLowerView,
  "twenty-one": TwentyOneView,
  trivia: QuizView,
  "emoji-movies": QuizView,
  "majority-rules": MajorityView,
  "most-likely": MostLikelyView,
  "never-have-i-ever": NhieView,
  "rank-it": RankItView,
  "secret-signal": SecretSignalView,
  "quick-categories": QuickCategoriesView,
  "caption-clash": CaptionView,
  "clue-rush": ClueRushView,
};
