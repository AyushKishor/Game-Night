"use client";
import { AVATARS } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Choose an avatar" className="grid grid-cols-8 gap-1.5">
      {AVATARS.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          aria-label={`Avatar ${a}`}
          onClick={() => onChange(a)}
          className={cn(
            "grid aspect-square place-items-center rounded-xl border text-2xl transition-colors",
            value === a ? "border-sky bg-sky/15" : "border-border bg-bg-2 hover:bg-surface-2",
          )}
        >
          {a}
        </button>
      ))}
    </div>
  );
}
