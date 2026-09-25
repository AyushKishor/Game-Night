"use client";
import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useSettings } from "@/lib/client/settings";
import { installAudioUnlock } from "@/lib/client/sound";
import { Toaster } from "./toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  const { highContrast, reducedMotion, reducedSensory } = useSettings();
  useEffect(() => {
    installAudioUnlock();
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.contrast = highContrast ? "high" : "normal";
    el.dataset.motion = reducedMotion || reducedSensory ? "reduced" : "full";
  }, [highContrast, reducedMotion, reducedSensory]);
  return (
    <MotionConfig reducedMotion={reducedMotion || reducedSensory ? "always" : "user"}>
      {children}
      <Toaster />
    </MotionConfig>
  );
}
