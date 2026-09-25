"use client";
import type { ComponentType } from "react";
import { SheddingView } from "./shedding-view";
import type { GameViewProps } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyView = ComponentType<GameViewProps<any, any>>;

export const GAME_VIEWS: Record<string, AnyView> = {
  "crazy-eights": SheddingView,
  switch: SheddingView,
};
