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
          <p className="text-muted mt-1 flex items-center gap-1 text-sm">
            <Users className="size-4" aria-hidden /> {game.minPlayers}–{game.maxPlayers} players · {game.duration}
          </p>
        </div>
      </div>
      <div className="bg-sky/10 text-sky mt-4 rounded-xl p-3">
        <p className="flex items-center gap-2 font-bold">
          <Flag className="size-4" aria-hidden /> Goal
        </p>
        <p className="text-text">{game.rules.goal}</p>
      </div>
      <h4 className="mt-4 flex items-center gap-2 font-bold">
        <ListChecks className="text-mint size-4" aria-hidden /> How to play
      </h4>
      <ol className="mt-2 space-y-2">
        {game.rules.steps.slice(0, compact ? 4 : undefined).map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="bg-surface-3 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold" aria-hidden>
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {!compact && (
        <>
          <h4 className="mt-4 flex items-center gap-2 font-bold">
            <Trophy className="text-amber size-4" aria-hidden /> Scoring
          </h4>
          <p className="text-muted mt-1">{game.rules.scoring}</p>
          <h4 className="mt-4 font-bold">Ending & ties</h4>
          <p className="text-muted mt-1">{game.rules.ending}</p>
        </>
      )}
    </div>
  );
}
