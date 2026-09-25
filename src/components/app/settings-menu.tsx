"use client";
import { Settings2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/client/settings";
import { play } from "@/lib/client/sound";

function Row({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id} className="text-text text-base">
          {label}
        </Label>
        <p className="text-muted text-sm">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SoundToggle() {
  const { soundOn, set } = useSettings();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => set({ soundOn: !soundOn })}
      aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
      aria-pressed={!soundOn}
      title={soundOn ? "Mute" : "Unmute"}
    >
      {soundOn ? <Volume2 /> : <VolumeX />}
    </Button>
  );
}

export function SettingsMenu() {
  const s = useSettings();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Display and sound settings" title="Settings">
          <Settings2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>These apply to this device only.</DialogDescription>
        <div className="divide-border mt-4 divide-y">
          <Row
            id="sound"
            label="Sound effects"
            hint="Subtle cues for turns, dealing and wins."
            checked={s.soundOn}
            onChange={(v) => s.set({ soundOn: v })}
          />
          <div className="py-3">
            <Label htmlFor="volume" className="text-text text-base">
              Volume
            </Label>
            <Slider
              id="volume"
              className="mt-2"
              thumbLabel="Volume"
              min={0}
              max={100}
              step={5}
              value={[Math.round(s.volume * 100)]}
              onValueChange={([v]) => s.set({ volume: (v ?? 0) / 100 })}
              onValueCommit={() => play("correct")}
              disabled={!s.soundOn}
            />
          </div>
          <Row
            id="sensory"
            label="Reduced sensory mode"
            hint="Only essential sounds (your turn, timer warning) and no animation."
            checked={s.reducedSensory}
            onChange={(v) => s.set({ reducedSensory: v })}
          />
          <Row
            id="motion"
            label="Reduce motion"
            hint="Turns off card and screen animations."
            checked={s.reducedMotion}
            onChange={(v) => s.set({ reducedMotion: v })}
          />
          <Row
            id="contrast"
            label="High-contrast cards"
            hint="Four-colour suits (♦ blue, ♣ green) and stronger outlines."
            checked={s.highContrast}
            onChange={(v) => s.set({ highContrast: v })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
