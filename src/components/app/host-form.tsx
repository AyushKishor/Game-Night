"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
import { saveSession } from "@/lib/client/session";
import { AVATARS } from "@/lib/shared/protocol";
import { NICKNAME_MAX } from "@/lib/shared/text";
import { AvatarPicker } from "./avatar-picker";

export function HostForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError("Enter a display name.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const res = await api.createRoom(name.trim(), avatar);
          saveSession(res.room.code, res.token, res.me.playerId);
          try {
            sessionStorage.setItem(`gn:view:${res.room.code}`, "table");
          } catch {}
          router.push(`/room/${res.room.code}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't create the room.");
          setBusy(false);
        }
      }}
    >
      <div>
        <Label htmlFor="host-name">Your display name</Label>
        <Input
          id="host-name"
          className="mt-1.5"
          value={name}
          maxLength={NICKNAME_MAX}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          placeholder="e.g. Priya"
          aria-invalid={!!error}
          aria-describedby={error ? "host-error" : undefined}
          autoFocus
        />
      </div>
      <div>
        <span className="text-sm font-semibold text-muted">Avatar</span>
        <div className="mt-1.5">
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
      </div>
      {error && (
        <p id="host-error" role="alert" className="text-sm font-medium text-rose">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {busy ? "Creating room…" : "Create room"}
      </Button>
    </form>
  );
}
