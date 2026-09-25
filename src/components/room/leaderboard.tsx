import { Crown, Medal } from "lucide-react";
import type { PublicPlayer } from "@/lib/shared/protocol";
import { cn } from "@/lib/utils";

export function Leaderboard({ players, meId, className }: { players: PublicPlayer[]; meId?: string; className?: string }) {
  const ranked = players
    .filter((p) => p.gamesPlayed > 0 || p.points > 0 || !p.isSpectator)
    .slice()
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  const places = ranked.map(
    (p) => 1 + ranked.filter((o) => o.points > p.points || (o.points === p.points && o.wins > p.wins)).length,
  );
  return (
    <div className={className}>
      <table className="w-full text-left">
        <caption className="sr-only">Game Night leaderboard</caption>
        <thead>
          <tr className="text-muted text-xs tracking-wider uppercase">
            <th scope="col" className="w-10 py-2">
              #
            </th>
            <th scope="col" className="py-2">
              Player
            </th>
            <th scope="col" className="py-2 text-right">
              Wins
            </th>
            <th scope="col" className="py-2 text-right">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => {
            const place = places[i]!;
            return (
              <tr key={p.id} className={cn("border-border border-t", p.id === meId && "bg-sky/5")}>
                <td className="py-2 font-mono font-bold">
                  {place === 1 && p.points > 0 ? <Crown className="text-amber size-5" aria-label="First place" /> : place}
                </td>
                <td className="py-2">
                  <span className="mr-2" aria-hidden>
                    {p.avatar}
                  </span>
                  <span className="font-semibold">{p.name}</span>
                  {p.id === meId && <span className="text-muted"> (you)</span>}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {p.wins > 0 && <Medal className="text-amber mr-1 inline size-4" aria-hidden />}
                  {p.wins}
                </td>
                <td className="py-2 text-right font-mono text-lg font-bold tabular-nums">{p.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted mt-2 text-xs">
        After each game you earn 1 point for every player you finish ahead of, plus 2 for a win (shared wins included).
      </p>
    </div>
  );
}
