import Link from "next/link";
import { ArrowRight, MonitorSmartphone, QrCode, Trophy, Users } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { JoinCodeForm } from "@/components/app/join-code-form";
import { GameIcon } from "@/components/room/game-icon";
import { Button } from "@/components/ui/button";
import { COMING_SOON, GAMES } from "@/games";

export default function Home() {
  const card = GAMES.filter((g) => g.meta.category === "card");
  const party = GAMES.filter((g) => g.meta.category === "party");
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Brand />
        <Link href="/rules" className="rounded-lg px-3 py-2 font-semibold text-muted hover:text-text">
          How to play
        </Link>
      </header>

      <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-16">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Put the games on the big screen.
            <br />
            <span className="text-coral">Keep your cards on your phone.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Open a room on your laptop or TV. Friends scan the QR code or type a six-letter code. Everyone&apos;s cards stay on their
            own device, and scores add up across the whole night.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="xl">
              <Link href="/host">
                Host a game <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
          <h2 className="font-display text-2xl font-bold">Join a game</h2>
          <p className="mt-1 text-muted">Enter the code on the host&apos;s screen.</p>
          <JoinCodeForm className="mt-5" />
        </div>
      </section>

      <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        {[
          { icon: MonitorSmartphone, title: "One shared screen", text: "The laptop shows the table, timer, turn and scores." },
          { icon: QrCode, title: "Join in seconds", text: "Scan, pick a nickname and an avatar. No accounts." },
          { icon: Trophy, title: "A night-long leaderboard", text: "Switch games without losing anyone's points." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-surface/70 p-5">
            <Icon className="size-7 text-sky" aria-hidden />
            <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
            <p className="text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="library" className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 id="library" className="font-display text-3xl font-extrabold">
            {GAMES.length} games ready to play
          </h2>
          <Link href="/rules" className="font-semibold text-sky hover:underline">
            Read all rules
          </Link>
        </div>
        {[
          { title: "Card games", list: card },
          { title: "Party games", list: party },
        ].map(({ title, list }) =>
          list.length ? (
            <div key={title} className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{title}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((g) => (
                  <li key={g.meta.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface/70 p-4">
                    <GameIcon game={g.meta} />
                    <div>
                      <p className="font-display text-lg font-bold">{g.meta.name}</p>
                      <p className="text-sm text-muted">{g.meta.tagline}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <Users className="size-3.5" aria-hidden /> {g.meta.minPlayers}–{g.meta.maxPlayers} players · {g.meta.duration}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {COMING_SOON.length > 0 && (
          <p className="mt-6 text-sm text-muted">Coming soon: {COMING_SOON.map((g) => g.name).join(", ")}.</p>
        )}
      </section>
    </main>
  );
}
