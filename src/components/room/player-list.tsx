"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Clock, Crown, Eye, Plus, UserMinus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { PublicPlayer, RoomSnapshot, CommandInput } from "@/lib/shared/protocol";
import { MAX_PLAYERS } from "@/lib/shared/protocol";

type Send = (c: CommandInput) => Promise<boolean>;

function PlayerRow({ p, room, meId, send }: { p: PublicPlayer; room: RoomSnapshot; meId: string; send: Send }) {
  const isHost = room.hostId === meId;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2.5"
    >
      <span className="text-3xl" aria-hidden>
        {p.avatar}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-lg font-semibold">
          {p.name}
          {p.id === meId && <span className="text-muted text-base font-normal">(you)</span>}
          {p.isHost && <Crown className="text-amber size-4 shrink-0" aria-label="Host" />}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          {p.isSpectator ? (
            <span className="text-violet inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden /> Spectating
            </span>
          ) : p.isBot ? (
            <span className="text-sky inline-flex items-center gap-1">
              <Bot className="size-3.5" aria-hidden /> Computer player
            </span>
          ) : p.ready || p.isHost ? (
            <span className="text-mint inline-flex items-center gap-1 font-semibold">
              <Check className="size-3.5" aria-hidden /> {p.isHost ? "Host" : "Ready"}
            </span>
          ) : (
            <span className="text-muted inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> Not ready
            </span>
          )}
          {!p.connected && (
            <span className="text-rose inline-flex items-center gap-1">
              <WifiOff className="size-3.5" aria-hidden /> Away
            </span>
          )}
          {p.points > 0 && <span className="text-muted">{p.points} pts</span>}
        </p>
      </div>
      {isHost && p.id !== meId && (
        <div className="flex gap-1">
          {!p.isBot && !p.isSpectator && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ kind: "transferHost", playerId: p.id })}
              aria-label={`Make ${p.name} the host`}
            >
              <Crown aria-hidden />
            </Button>
          )}
          {p.isBot ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ kind: "removeBot", playerId: p.id })}
              aria-label={`Remove ${p.name}`}
            >
              <UserMinus aria-hidden />
            </Button>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={`Remove ${p.name} from the room`}>
                  <UserMinus aria-hidden />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Remove {p.name}?</DialogTitle>
                <DialogDescription>
                  They&apos;ll be signed out of this room. If a game is running, the computer plays their seat.
                </DialogDescription>
                <div className="mt-6 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger" onClick={() => send({ kind: "kick", playerId: p.id })}>
                      Remove
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </motion.li>
  );
}

export function PlayerList({ room, meId, send }: { room: RoomSnapshot; meId: string; send: Send }) {
  const seated = room.players.filter((p) => !p.isSpectator);
  const spectators = room.players.filter((p) => p.isSpectator);
  const isHost = room.hostId === meId;
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          Players{" "}
          <span className="text-muted">
            {seated.length}/{MAX_PLAYERS}
          </span>
        </PanelTitle>
        {isHost && (
          <Button variant="secondary" size="sm" onClick={() => send({ kind: "addBot" })} disabled={seated.length >= MAX_PLAYERS}>
            <Plus aria-hidden /> Add bot
          </Button>
        )}
      </PanelHeader>
      <PanelBody>
        <ul className="space-y-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {seated.map((p) => (
              <PlayerRow key={p.id} p={p} room={room} meId={meId} send={send} />
            ))}
          </AnimatePresence>
        </ul>
        {seated.length < 2 && (
          <p className="text-muted mt-3 text-sm">Waiting for friends to join… Share the code or add a bot.</p>
        )}
        {spectators.length > 0 && (
          <>
            <h3 className="text-muted mt-4 mb-2 text-sm font-bold tracking-wider uppercase">Spectators</h3>
            <ul className="space-y-2">
              {spectators.map((p) => (
                <PlayerRow key={p.id} p={p} room={room} meId={meId} send={send} />
              ))}
            </ul>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
