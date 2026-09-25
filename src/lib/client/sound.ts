"use client";
import { useSettings } from "./settings";

/**
 * Sound abstraction. All effects are synthesised with the Web Audio API, so
 * no audio files (and no licensing questions) are involved. To use recorded
 * assets instead, drop permissively-licensed files into /public/sounds and
 * map them in `SAMPLE_FILES` — `play()` will prefer them automatically.
 *
 * Browsers block audio until the user interacts with the page; the audio
 * context is only created after the first pointer/key event, so nothing
 * ever autoplays.
 */
export type SoundName = "join" | "deal" | "turn" | "warning" | "correct" | "roundEnd" | "victory" | "error";

const SAMPLE_FILES: Partial<Record<SoundName, string>> = {
  // e.g. deal: "/sounds/deal.mp3"
};

/** Cues that still play in reduced-sensory mode (they carry information). */
const ESSENTIAL: SoundName[] = ["turn", "warning"];

let ctx: AudioContext | null = null;
let unlocked = false;

export function installAudioUnlock() {
  if (typeof window === "undefined" || unlocked) return;
  const unlock = () => {
    unlocked = true;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC && !ctx) ctx = new AC();
      void ctx?.resume();
    } catch {
      ctx = null;
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
}

function tone(freq: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(start: number, duration: number, volume: number) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

const RECIPES: Record<SoundName, (v: number) => void> = {
  join: (v) => {
    tone(523, 0, 0.12, v * 0.5);
    tone(784, 0.09, 0.18, v * 0.5);
  },
  deal: (v) => {
    for (let i = 0; i < 4; i++) noise(i * 0.06, 0.05, v * 0.35);
  },
  turn: (v) => {
    tone(660, 0, 0.14, v * 0.45, "triangle");
    tone(990, 0.12, 0.22, v * 0.4, "triangle");
  },
  warning: (v) => {
    tone(440, 0, 0.1, v * 0.4, "square");
    tone(440, 0.18, 0.1, v * 0.4, "square");
  },
  correct: (v) => {
    tone(659, 0, 0.1, v * 0.4);
    tone(880, 0.08, 0.16, v * 0.4);
  },
  roundEnd: (v) => {
    tone(392, 0, 0.15, v * 0.4, "triangle");
    tone(523, 0.12, 0.15, v * 0.4, "triangle");
    tone(659, 0.24, 0.25, v * 0.4, "triangle");
  },
  victory: (v) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, v * 0.4, "triangle"));
  },
  error: (v) => tone(196, 0, 0.18, v * 0.35, "sawtooth"),
};

const sampleCache = new Map<string, HTMLAudioElement>();

export function play(name: SoundName) {
  if (typeof window === "undefined" || !unlocked) return;
  const { soundOn, volume, reducedSensory } = useSettings.getState();
  if (!soundOn || volume <= 0) return;
  if (reducedSensory && !ESSENTIAL.includes(name)) return;
  const file = SAMPLE_FILES[name];
  if (file) {
    let el = sampleCache.get(file);
    if (!el) sampleCache.set(file, (el = new Audio(file)));
    el.volume = volume;
    el.currentTime = 0;
    void el.play().catch(() => {});
    return;
  }
  try {
    if (ctx?.state === "suspended") void ctx.resume();
    RECIPES[name](volume);
  } catch {
    /* audio is optional */
  }
}
