"use client";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PRESET_LABELS } from "@/lib/engine/helpers";
import type { AnyGameModule, GameConfig, PresetId, SettingKey } from "@/lib/engine/types";
import type { RoomSnapshot, CommandInput } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";

type Send = (c: CommandInput) => Promise<boolean>;

const TURN_OPTIONS = [0, 10, 15, 20, 30, 45, 60, 90];
const ROUND_OPTIONS = [0, 20, 30, 45, 60, 90, 120];
const TARGET_OPTIONS = [25, 50, 100, 150, 200, 300, 500];

function Choice<T extends string | number>({
  id,
  label,
  value,
  options,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: T[];
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="text-muted text-sm font-semibold">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "h-10 min-w-12 rounded-lg border px-3 text-sm font-semibold transition-colors",
              value === o ? "border-sky bg-sky/15 text-text" : "border-border bg-bg-2 text-muted hover:text-text",
            )}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-text text-base">
          {label}
        </Label>
        {hint && <p className="text-muted text-sm">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const TOGGLE_LABELS: Partial<Record<SettingKey, { label: string; hint: string }>> = {
  teamMode: { label: "Team mode", hint: "Partners sitting opposite score together." },
  familyFriendly: { label: "Family-friendly filter", hint: "Blocks rude words in answers and captions." },
  allowJoinInProgress: { label: "Late joiners play", hint: "New arrivals join the current game at the next round." },
};

export function GameSettings({ room, game, send }: { room: RoomSnapshot; game: AnyGameModule; send: Send }) {
  const c = room.config;
  const set = (patch: Partial<GameConfig>) => send({ kind: "configure", config: patch });
  const has = (k: SettingKey) => game.settings.includes(k);
  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Preset">
        <p className="text-muted text-sm font-semibold">Preset</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {(Object.keys(PRESET_LABELS) as PresetId[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={room.preset === p}
              onClick={() => send({ kind: "configure", preset: p })}
              className={cn(
                "h-11 rounded-lg border text-sm font-bold transition-colors",
                room.preset === p ? "border-coral bg-coral/15 text-text" : "border-border bg-bg-2 text-muted hover:text-text",
              )}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {room.preset === "custom" && <p className="text-muted mt-1 text-xs">Custom settings</p>}
      </div>

      {has("rounds") && (
        <div>
          <p id="rounds-label" className="text-muted text-sm font-semibold">
            Rounds
          </p>
          <div className="mt-1.5 flex items-center gap-2" role="group" aria-labelledby="rounds-label">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Fewer rounds"
              onClick={() => set({ rounds: Math.max(1, c.rounds - 1) })}
            >
              <Minus />
            </Button>
            <span className="w-10 text-center font-mono text-xl font-bold" aria-live="polite">
              {c.rounds}
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="More rounds"
              onClick={() => set({ rounds: Math.min(30, c.rounds + 1) })}
            >
              <Plus />
            </Button>
          </div>
        </div>
      )}
      {has("targetScore") && (
        <Choice
          id="target"
          label={game.meta.lowerIsBetter ? "Game ends when someone reaches" : "Target score"}
          value={c.targetScore}
          options={
            TARGET_OPTIONS.includes(c.targetScore) ? TARGET_OPTIONS : [...TARGET_OPTIONS, c.targetScore].sort((a, b) => a - b)
          }
          format={(v) => String(v)}
          onChange={(v) => set({ targetScore: v })}
        />
      )}
      {has("turnSeconds") && (
        <Choice
          id="turn"
          label="Turn timer"
          value={c.turnSeconds}
          options={TURN_OPTIONS.includes(c.turnSeconds) ? TURN_OPTIONS : [...TURN_OPTIONS, c.turnSeconds].sort((a, b) => a - b)}
          format={(v) => (v === 0 ? "Off" : `${v}s`)}
          onChange={(v) => set({ turnSeconds: v })}
        />
      )}
      {has("roundSeconds") && (
        <Choice
          id="round"
          label="Round timer"
          value={c.roundSeconds}
          options={
            ROUND_OPTIONS.includes(c.roundSeconds) ? ROUND_OPTIONS : [...ROUND_OPTIONS, c.roundSeconds].sort((a, b) => a - b)
          }
          format={(v) => (v === 0 ? "Off" : `${v}s`)}
          onChange={(v) => set({ roundSeconds: v })}
        />
      )}
      {has("difficulty") && (
        <Choice
          id="difficulty"
          label="Difficulty"
          value={c.difficulty}
          options={["easy", "normal", "hard"] as const as unknown as GameConfig["difficulty"][]}
          format={(v) => v[0]!.toUpperCase() + v.slice(1)}
          onChange={(v) => set({ difficulty: v })}
        />
      )}
      {(["teamMode", "familyFriendly", "allowJoinInProgress"] as const).filter(has).map((k) => (
        <Toggle
          key={k}
          id={k}
          label={TOGGLE_LABELS[k]!.label}
          hint={TOGGLE_LABELS[k]!.hint}
          checked={Boolean(c[k])}
          onChange={(v) => set({ [k]: v })}
        />
      ))}
      {(game.houseRules ?? []).map((r) => (
        <Toggle
          key={r.key}
          id={`hr-${r.key}`}
          label={`House rule: ${r.label}`}
          hint={r.description}
          checked={c.houseRules[r.key] ?? r.default}
          onChange={(v) => set({ houseRules: { [r.key]: v } })}
        />
      ))}
    </div>
  );
}

export function RoomSettings({ room, send }: { room: RoomSnapshot; send: Send }) {
  return (
    <div className="space-y-4">
      <Toggle
        id="lock"
        label="Lock room"
        hint="Nobody new can join. Players already here can reconnect."
        checked={room.locked}
        onChange={(v) => send({ kind: "lock", locked: v })}
      />
      <Toggle
        id="spectators"
        label="Allow spectators"
        hint="People can watch without playing."
        checked={room.allowSpectators}
        onChange={(v) => send({ kind: "allowSpectators", allow: v })}
      />
    </div>
  );
}
