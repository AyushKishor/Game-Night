import { Flag, ListChecks, Trophy, Users } from "lucide-react";
import type { GameMeta } from "@/lib/engine/types";
import { GameIcon } from "./game-icon";

export function RulesCard({ game, compact }: { game: GameMeta; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <GameIcon game={game} />
        <div>
          <h3 className="font-display text-2xl font-extrabold">{game.name}</h3>
          <p className="text-muted">{game.tagline}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <Users className="size-4" aria-hidden /> {game.minPlayers}–{game.maxPlayers} players · {game.duration}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-sky/10 p-3 text-sky">
        <p className="flex items-center gap-2 font-bold">
          <Flag className="size-4" aria-hidden /> Goal
        </p>
        <p className="text-text">{game.rules.goal}</p>
      </div>
      <h4 className="mt-4 flex items-center gap-2 font-bold">
        <ListChecks className="size-4 text-mint" aria-hidden /> How to play
      </h4>
      <ol className="mt-2 space-y-2">
        {game.rules.steps.slice(0, compact ? 4 : undefined).map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold" aria-hidden>
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {!compact && (
        <>
          <h4 className="mt-4 flex items-center gap-2 font-bold">
            <Trophy className="size-4 text-amber" aria-hidden /> Scoring
          </h4>
          <p className="mt-1 text-muted">{game.rules.scoring}</p>
          <h4 className="mt-4 font-bold">Ending & ties</h4>
          <p className="mt-1 text-muted">{game.rules.ending}</p>
        </>
      )}
    </div>
  );
}
