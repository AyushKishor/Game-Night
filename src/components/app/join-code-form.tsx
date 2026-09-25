"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROOM_CODE_ALPHABET } from "@/lib/shared/protocol";

export function JoinCodeForm({ className }: { className?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clean = (v: string) =>
    v
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== 6 || [...code].some((c) => !ROOM_CODE_ALPHABET.includes(c))) {
          setError("Room codes are 6 letters and numbers, like K7P4XM.");
          return;
        }
        router.push(`/join?code=${code}`);
      }}
    >
      <Label htmlFor="room-code">Room code</Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id="room-code"
          value={code}
          onChange={(e) => {
            setCode(clean(e.target.value));
            setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7P4XM"
          aria-invalid={!!error}
          aria-describedby={error ? "room-code-error" : undefined}
          className="h-14 font-mono text-2xl font-bold uppercase tracking-[0.3em]"
        />
        <Button type="submit" size="lg" className="h-14" aria-label="Join room">
          Join <ArrowRight aria-hidden />
        </Button>
      </div>
      {error && (
        <p id="room-code-error" className="mt-2 text-sm font-medium text-rose" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
