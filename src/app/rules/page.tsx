import type { Metadata } from "next";
import { Brand } from "@/components/app/brand";
import { RulesCard } from "@/components/room/rules-card";
import { GAMES } from "@/games";

export const metadata: Metadata = { title: "How to play" };

export default function RulesPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 sm:px-6">
      <Brand />
      <h1 className="font-display mt-8 text-4xl font-extrabold">How to play</h1>
      <p className="text-muted mt-2 max-w-2xl">
        Every game is hosted on one shared screen, and each player uses their own phone for private cards and answers. Scores from
        every finished game add up on the Game Night leaderboard.
      </p>
      <nav aria-label="Games" className="mt-6 flex flex-wrap gap-2">
        {GAMES.map((g) => (
          <a
            key={g.meta.id}
            href={`#${g.meta.id}`}
            className="bg-surface-2 hover:bg-surface-3 rounded-full px-3 py-1 text-sm font-semibold"
          >
            {g.meta.name}
          </a>
        ))}
      </nav>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {GAMES.map((g) => (
          <section key={g.meta.id} id={g.meta.id} className="border-border bg-surface/80 scroll-mt-6 rounded-2xl border p-5">
            <RulesCard game={g.meta} />
          </section>
        ))}
      </div>
    </main>
  );
}
