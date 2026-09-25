"use client";
import { useState } from "react";
import { BookOpen, Check, Eye, Gamepad2, Play, Settings2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ViewMode } from "@/components/game/types";
import { getGame } from "@/games";
import type { StateResponse, CommandInput } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";
import { GameLibrary } from "./game-library";
import { GameSettings, RoomSettings } from "./game-settings";
import { Leaderboard } from "./leaderboard";
import { PlayerList } from "./player-list";
import { RulesCard } from "./rules-card";
import { SharePanel } from "./share-panel";

type Send = (c: CommandInput) => Promise<boolean>;

export function Lobby({ data, mode, send }: { data: StateResponse; mode: ViewMode; send: Send; names: Record<string, string> }) {
  const { room, me } = data;
  const isHost = me.isHost;
  const game = getGame(room.selectedGameId);
  const seated = room.players.filter((p) => !p.isSpectator);
  const self = room.players.find((p) => p.id === me.playerId);
  const [picking, setPicking] = useState(!game);
  const notReady = seated.filter((p) => !p.isBot && !p.ready && !p.isHost);
  const countOk = game ? seated.length >= game.meta.minPlayers && seated.length <= game.meta.maxPlayers : false;
  const startBlocker = !game
    ? "Choose a game to start."
    : !countOk
      ? `${game.meta.name} needs ${game.meta.minPlayers}–${game.meta.maxPlayers} players (you have ${seated.length}).`
      : notReady.length
        ? `Waiting for ${notReady.map((p) => p.name).join(", ")} to get ready.`
        : null;
  const hasScores = room.players.some((p) => p.points > 0);

  const readyBar = !me.isSpectator && !isHost && (
    <Panel className="p-4">
      <Button
        size="xl"
        variant={self?.ready ? "mint" : "primary"}
        className="w-full"
        onClick={() => send({ kind: "ready", ready: !self?.ready })}
        aria-pressed={self?.ready}
      >
        {self?.ready ? <Check aria-hidden /> : null}
        {self?.ready ? "Ready! (tap to undo)" : "I'm ready"}
      </Button>
      <div className="text-muted mt-3 flex items-center justify-between text-sm">
        <span>{game ? `Next up: ${game.meta.name}` : "The host is choosing a game…"}</span>
        {room.allowSpectators && (
          <Button variant="ghost" size="sm" onClick={() => send({ kind: "setSpectator", spectator: true })}>
            <Eye aria-hidden /> Just watch
          </Button>
        )}
      </div>
    </Panel>
  );

  const spectatorBar = me.isSpectator && (
    <Panel className="flex items-center justify-between gap-3 p-4">
      <span className="text-muted">You&apos;re spectating.</span>
      <Button variant="secondary" onClick={() => send({ kind: "setSpectator", spectator: false })}>
        Take a seat
      </Button>
    </Panel>
  );

  const startBar = isHost && (
    <Panel className="p-4">
      <Button size="xl" className="w-full" disabled={!!startBlocker} onClick={() => send({ kind: "start" })}>
        <Play aria-hidden /> Start {game?.meta.name ?? "game"}
      </Button>
      <p className={cn("mt-2 text-center text-sm", startBlocker ? "text-amber" : "text-mint")} role="status">
        {startBlocker ?? "Everyone's ready!"}
      </p>
    </Panel>
  );

  const gamePanel = (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Gamepad2 className="text-coral size-5" aria-hidden /> {isHost && picking ? "Choose a game" : "Game"}
        </PanelTitle>
        {isHost && game && (
          <Button variant="ghost" size="sm" onClick={() => setPicking(!picking)}>
            {picking ? "Done" : "Change game"}
          </Button>
        )}
      </PanelHeader>
      <PanelBody>
        {isHost && (picking || !game) ? (
          <GameLibrary
            selectedId={room.selectedGameId}
            playerCount={seated.length}
            onSelect={async (id) => {
              if (await send({ kind: "selectGame", gameId: id })) setPicking(false);
            }}
          />
        ) : game ? (
          <div className="space-y-5">
            <RulesCard game={game.meta} compact={mode === "hand"} />
            {mode === "hand" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <BookOpen aria-hidden /> Full rules
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogTitle className="sr-only">{game.meta.name} rules</DialogTitle>
                  <RulesCard game={game.meta} />
                </DialogContent>
              </Dialog>
            )}
          </div>
        ) : (
          <p className="text-muted">The host is choosing a game…</p>
        )}
      </PanelBody>
    </Panel>
  );

  const settingsPanel = isHost && game && !picking && (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Settings2 className="text-sky size-5" aria-hidden /> Settings
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="space-y-6">
        <GameSettings room={room} game={game} send={send} />
        <hr className="border-border" />
        <RoomSettings room={room} send={send} />
      </PanelBody>
    </Panel>
  );

  const leaderboardPanel = hasScores && (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Trophy className="text-amber size-5" aria-hidden /> Tonight&apos;s leaderboard
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        <Leaderboard players={room.players} meId={me.playerId} />
      </PanelBody>
    </Panel>
  );

  if (mode === "table") {
    return (
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SharePanel code={room.code} large />
          <PlayerList room={room} meId={me.playerId} send={send} />
          {leaderboardPanel}
        </div>
        <div className="space-y-5">
          {startBar}
          {readyBar}
          {spectatorBar}
          {gamePanel}
          {settingsPanel}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {readyBar}
      {startBar}
      {spectatorBar}
      {gamePanel}
      {settingsPanel}
      <PlayerList room={room} meId={me.playerId} send={send} />
      {leaderboardPanel}
      <SharePanel code={room.code} />
    </div>
  );
}
