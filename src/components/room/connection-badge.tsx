"use client";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useRoomStore } from "@/lib/client/room-store";
import { cn } from "@/lib/utils";

export function ConnectionBadge() {
  const status = useRoomStore((s) => s.status);
  const label = status === "live" ? "Live" : status === "offline" ? "Offline — reconnecting" : status === "connecting" ? "Connecting" : "Syncing";
  const Icon = status === "offline" ? WifiOff : status === "live" ? Wifi : RefreshCw;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold",
        status === "live" && "bg-mint/15 text-mint",
        status === "offline" && "bg-rose/15 text-rose",
        (status === "polling" || status === "connecting") && "bg-amber/15 text-amber",
      )}
    >
      <Icon className={cn("size-3.5", status !== "live" && status !== "offline" && "animate-spin [animation-duration:2s]")} aria-hidden />
      <span className={cn(status === "live" && "max-sm:sr-only")}>{label}</span>
    </span>
  );
}
