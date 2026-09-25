"use client";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeSnapshot, RoomSnapshot } from "@/lib/shared/protocol";
import { Countdown } from "./common";

/** Host-controlled "continue" with an automatic countdown for everyone else. */
export function NextRoundButton({
  room,
  me,
  deadline,
  onNext,
  label = "Next round",
}: {
  room: RoomSnapshot;
  me: MeSnapshot;
  deadline: number | null;
  onNext: () => void;
  label?: string;
}) {
  const isHost = room.hostId === me.playerId;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isHost ? (
        <Button variant="mint" size="lg" onClick={onNext}>
          {label} <ChevronRight aria-hidden />
        </Button>
      ) : (
        <span className="text-muted text-sm">Waiting for the host to continue…</span>
      )}
      <Countdown deadline={deadline} label="Continues automatically in" className="w-48" />
    </div>
  );
}
