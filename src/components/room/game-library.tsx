"use client";
import { useState } from "react";
import { BookOpen, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMING_SOON, GAMES } from "@/games";
import type { GameMeta } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { GameIcon } from "./game-icon";
import { RulesCard } from "./rules-card";

export function GameLibrary({
  selectedId,
  playerCount,
  onSelect,
}: {
  selectedId: string | null;
  playerCount: number;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "card" | "party" | "fits">("all");
  const [rulesFor, setRulesFor] = useState<GameMeta | null>(null);
  const list = GAMES.map((g) => g.meta).filter((m) =>
    filter === "all" ? true : filter === "fits" ? playerCount >= m.minPlayers && playerCount <= m.maxPlayers : m.category === filter,
  );
  return (
    <div>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList aria-label="Filter games" className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="fits">Fits {playerCount}</TabsTrigger>
          <TabsTrigger value="card">Cards</TabsTrigger>
          <TabsTrigger value="party">Party</TabsTrigger>
        </TabsList>
      </Tabs>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {list.map((m) => {
          const fits = playerCount >= m.minPlayers && playerCount <= m.maxPlayers;
          const selected = selectedId === m.id;
          return (
            <li key={m.id}>
              <div
                className={cn(
                  "flex h-full items-start gap-3 rounded-xl border p-3 transition-colors",
                  selected ? "border-sky bg-sky/10" : "border-border bg-surface-2 hover:border-muted/60",
                )}
              >
                <GameIcon game={m} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold leading-tight">{m.name}</p>
                  <p className="text-sm text-muted">{m.tagline}</p>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs", fits ? "text-muted" : "text-amber")}>
                    <Users className="size-3.5" aria-hidden /> {m.minPlayers}–{m.maxPlayers} players
                    {!fits && ` · you have ${playerCount}`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant={selected ? "mint" : "secondary"} onClick={() => onSelect(m.id)} aria-pressed={selected}>
                      {selected ? <Check aria-hidden /> : null}
                      {selected ? "Selected" : "Choose"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRulesFor(m)} aria-label={`Rules for ${m.name}`}>
                      <BookOpen aria-hidden /> Rules
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {COMING_SOON.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Coming soon (not playable yet): {COMING_SOON.map((g) => g.name).join(", ")}
        </p>
      )}
      <Dialog open={!!rulesFor} onOpenChange={(o) => !o && setRulesFor(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle className="sr-only">{rulesFor?.name} rules</DialogTitle>
          {rulesFor && <RulesCard game={rulesFor} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
