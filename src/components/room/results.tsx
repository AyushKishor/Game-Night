"use client";
import { motion } from "framer-motion";
import { Home, LayoutGrid, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ViewMode } from "@/components/game/types";
import { getGame } from "@/games";
import type { StateResponse, CommandInput } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";
import { Leaderboard } from "./leaderboard";

type Send = (c: CommandInput) => Promise<boolean>;

export function Results({
  data,
  send,
  names,
  mode,
}: {
  data: StateResponse;
  send: Send;
  names: Record<string, string>;
  mode: ViewMode;
}) {
  const { room, me } = data;
  const res = room.lastResults;
  const game = getGame(res?.gameId ?? room.selectedGameId);
  if (!res) return null;
  const mine = res.standings.find((s) => s.playerId === me.playerId);
  const winners = res.standings.filter((s) => s.place === 1);
  return (
    <div className={cn("grid gap-5", mode === "table" && "md:grid-cols-[1.2fr_1fr]")}>
      <div className="space-y-5">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="border-amber/50 from-amber/15 to-coral/10 shadow-soft rounded-3xl border bg-gradient-to-br p-6 text-center sm:p-8"
        >
          <Trophy className="text-amber mx-auto size-12" aria-hidden />
          <p className="text-muted mt-2 text-sm font-bold tracking-wider uppercase">{game?.meta.name} · final result</p>
          <h1 className="font-display mt-1 text-3xl font-extrabold sm:text-5xl" aria-live="polite">
            {res.summary}
          </h1>
          {mine && (
            <p className="text-muted mt-3 text-lg">
              You finished {mine.place === 1 ? (winners.length > 1 ? "tied for first" : "first") : `#${mine.place}`} and earned{" "}
              <strong className="text-text">+{res.awarded[me.playerId] ?? 0}</strong> Game Night points.
            </p>
          )}
        </motion.div>

        <Panel>
          <PanelHeader>
            <PanelTitle>Standings</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <ol className="space-y-2">
              {res.standings.map((s) => (
                <li
                  key={s.playerId}
                  className={cn(
                    "bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2.5",
                    s.place === 1 && "ring-amber/60 ring-2",
                  )}
                >
                  <span className="w-8 text-center font-mono text-xl font-bold" aria-label={`Place ${s.place}`}>
                    {s.place}
                  </span>
                  <span className="flex-1 truncate text-lg font-semibold">
                    {names[s.playerId] ?? "Player"}
                    {s.playerId === me.playerId && <span className="text-muted"> (you)</span>}
                  </span>
                  <span className="text-muted text-sm">
                    {game?.meta.lowerIsBetter ? "Penalty" : "Score"} <strong className="text-text font-mono">{s.score}</strong>
                  </span>
                  <span className="bg-mint/15 text-mint rounded-lg px-2 py-1 font-mono text-sm font-bold">
                    +{res.awarded[s.playerId] ?? 0}
                  </span>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>

        {me.isHost ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <Button size="lg" onClick={() => send({ kind: "rematch" })}>
              <RotateCcw aria-hidden /> Play again
            </Button>
            <Button size="lg" variant="sky" onClick={() => send({ kind: "toLobby" })}>
              <LayoutGrid aria-hidden /> Change game
            </Button>
            <Button size="lg" variant="secondary" onClick={() => send({ kind: "toLobby" })}>
              <Home aria-hidden /> Back to lobby
            </Button>
          </div>
        ) : (
          <p className="bg-surface-2 text-muted rounded-xl p-4 text-center" role="status">
            Waiting for the host to pick what&apos;s next…
          </p>
        )}
      </div>
      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            <Trophy className="text-amber size-5" aria-hidden /> Game Night leaderboard
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          <Leaderboard players={room.players} meId={me.playerId} />
          {room.history.length > 0 && (
            <>
              <h3 className="text-muted mt-5 text-sm font-bold tracking-wider uppercase">Games played tonight</h3>
              <ol className="mt-2 space-y-1 text-sm">
                {room.history
                  .slice()
                  .reverse()
                  .map((h) => (
                    <li key={h.finishedAt} className="flex justify-between gap-3">
                      <span>{getGame(h.gameId)?.meta.name ?? h.gameId}</span>
                      <span className="text-muted">{h.winners.join(", ")}</span>
                    </li>
                  ))}
              </ol>
            </>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
