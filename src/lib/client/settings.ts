"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Settings {
  soundOn: boolean;
  volume: number; // 0..1
  reducedSensory: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  set: (patch: Partial<Omit<Settings, "set">>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      soundOn: true,
      volume: 0.5,
      reducedSensory: false,
      highContrast: false,
      reducedMotion: false,
      set: (patch) => set(patch),
    }),
    { name: "gn:settings" },
  ),
);
