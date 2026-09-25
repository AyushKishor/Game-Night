/** Regenerates GAME_RULES.md from the rules defined in each game module. */
import { writeFileSync } from "node:fs";
import { GAMES } from "../src/games";

const lines: string[] = [
  "# Game Night — Rules",
  "",
  "_Generated from the game modules by `npm run rules:generate`. The same rules are shown in the app._",
  "",
  `${GAMES.length} games are fully playable. Games marked **bots** can be filled with computer players.`,
  "",
];
for (const category of ["party", "card"] as const) {
  lines.push(`## ${category === "party" ? "Party games" : "Card games"}`, "");
  for (const g of GAMES.filter((x) => x.meta.category === category)) {
    const m = g.meta;
    lines.push(`### ${m.name}`, "");
    lines.push(`_${m.tagline}_ · ${m.minPlayers}–${m.maxPlayers} players · ${m.duration}${m.supportsBots ? " · bots" : ""}`, "");
    lines.push(`**Goal:** ${m.rules.goal}`, "");
    m.rules.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("", `**Scoring:** ${m.rules.scoring}`, "", `**Ending & ties:** ${m.rules.ending}`, "");
    if (g.houseRules?.length)
      lines.push(`**House rules:** ${g.houseRules.map((h) => `${h.label} — ${h.description}`).join("; ")}`, "");
  }
}
lines.push(
  "## Game Night leaderboard",
  "",
  "After every finished game, each player earns 1 point for every player they finished ahead of, plus 2 points for a win (shared wins count). Points carry across every game played in the same room. Games ended early by the host award nothing.",
  "",
);
writeFileSync("GAME_RULES.md", lines.join("\n"));
console.log(`Wrote GAME_RULES.md (${GAMES.length} games)`);
