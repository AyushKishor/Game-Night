"use client";
import { BookOpen, Smartphone, Square, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { GAME_VIEWS } from "@/components/game/registry";
import type { ViewMode } from "@/components/game/types";
import { getGame } from "@/games";
import type { Command, StateResponse, CommandInput } from "@/lib/shared/protocol";
import { GameIcon } from "./game-icon";
import { Leaderboard } from "./leaderboard";
import { RulesCard } from "./rules-card";
import { SharePanel } from "./share-panel";

type Send = (c: CommandInput) => Promise<boolean>;

export function GameStage({
  data,
  mode,
  send,
  names,
  onSwitchToHand,
}: {
  data: StateResponse;
  mode: ViewMode;
  send: Send;
  names: Record<string, string>;
  onSwitchToHand: () => void;
}) {
  const { room, me } = data;
  const snap = room.game!;
  const game = getGame(snap.gameId);
  const View = GAME_VIEWS[snap.gameId];
  const inGame = snap.players.includes(me.playerId);
  const myTurn = snap.pending.includes(me.playerId);
  const gameSend = (action: object) => send({ kind: "game", action });

  return (
    <div className={mode === "table" ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]" : "mx-auto max-w-3xl"}>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {game && <GameIcon game={game.meta} className="size-10" />}
          <h1 className="font-display text-2xl font-extrabold">{game?.meta.name}</h1>
          <div className="ml-auto flex flex-wrap gap-1">
            {game && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <BookOpen aria-hidden /> Rules
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogTitle className="sr-only">{game.meta.name} rules</DialogTitle>
                  <RulesCard game={game.meta} />
                </DialogContent>
              </Dialog>
            )}
            {me.isHost && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Square aria-hidden /> End game
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>End this game?</DialogTitle>
                  <DialogDescription>Everyone returns to the lobby. No Game Night points are awarded for an unfinished game.</DialogDescription>
                  <div className="mt-6 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="secondary">Keep playing</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="danger" onClick={() => send({ kind: "endGame" })}>
                        End game
                      </Button>
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {mode === "table" && inGame && myTurn && (
          <button
            type="button"
            onClick={onSwitchToHand}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber/60 bg-amber/10 px-4 py-2 font-semibold text-amber"
          >
            <Smartphone className="size-4" aria-hidden /> It&apos;s your turn — open your hand privately (or use your phone)
          </button>
        )}
        {!inGame && !me.isSpectator && (
          <p className="rounded-xl bg-surface-2 px-4 py-2 text-sm text-muted" role="status">
            You joined mid-game — you&apos;ll be dealt in next game. Enjoy the show!
          </p>
        )}

        {View ? (
          <View
            pub={snap.publicState}
            priv={inGame ? me.private : null}
            mode={inGame ? mode : "table"}
            room={room}
            game={snap}
            me={me}
            names={names}
            send={gameSend}
          />
        ) : (
          <p role="alert">This game can&apos;t be displayed.</p>
        )}
      </div>
      {mode === "table" && (
        <aside className="space-y-4" aria-label="Room info">
          <Panel>
            <PanelHeader>
              <PanelTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-amber" aria-hidden /> Leaderboard
              </PanelTitle>
            </PanelHeader>
            <PanelBody>
              <Leaderboard players={room.players.filter((p) => !p.isSpectator)} meId={me.playerId} />
            </PanelBody>
          </Panel>
          <SharePanel code={room.code} />
        </aside>
      )}
    </div>
  );
}
