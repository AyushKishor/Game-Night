/**
 * The 106-card Monopoly Deal-style deck: money, actions, rent and
 * properties (including two-colour and any-colour wildcards).
 */

export const COLORS = [
  "brown",
  "lightBlue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
  "railroad",
  "utility",
] as const;
export type Color = (typeof COLORS)[number];

export interface ColorInfo {
  name: string;
  /** Cards needed for a full set. */
  size: number;
  /** Rent by number of properties owned (index 0 = one property). */
  rent: number[];
  /** CSS colour for the UI. */
  hex: string;
}

export const COLOR_INFO: Record<Color, ColorInfo> = {
  brown: { name: "Brown", size: 2, rent: [1, 2], hex: "#8b5a2b" },
  lightBlue: { name: "Light Blue", size: 3, rent: [1, 2, 3], hex: "#8fd3f4" },
  pink: { name: "Pink", size: 3, rent: [1, 2, 4], hex: "#e0529c" },
  orange: { name: "Orange", size: 3, rent: [1, 3, 5], hex: "#f58b1f" },
  red: { name: "Red", size: 3, rent: [2, 3, 6], hex: "#e23b3b" },
  yellow: { name: "Yellow", size: 3, rent: [2, 4, 6], hex: "#f5d31b" },
  green: { name: "Green", size: 3, rent: [2, 4, 7], hex: "#1f9d55" },
  darkBlue: { name: "Dark Blue", size: 2, rent: [3, 8], hex: "#2446b8" },
  railroad: { name: "Railroad", size: 4, rent: [1, 2, 3, 4], hex: "#3b3b3b" },
  utility: { name: "Utility", size: 2, rent: [1, 2], hex: "#b8c77a" },
};

/** Houses and hotels can't go on these. */
export const NO_BUILDINGS: readonly Color[] = ["railroad", "utility"];

export type ActionKind =
  | "dealBreaker"
  | "justSayNo"
  | "slyDeal"
  | "forcedDeal"
  | "debtCollector"
  | "birthday"
  | "passGo"
  | "house"
  | "hotel"
  | "doubleRent";

export type CardDef =
  | { id: string; kind: "money"; value: number; name: string }
  | { id: string; kind: "property"; value: number; name: string; color: Color }
  | { id: string; kind: "wild"; value: number; name: string; colors: Color[] }
  | { id: string; kind: "action"; value: number; name: string; action: ActionKind; text: string }
  | { id: string; kind: "rent"; value: number; name: string; colors: Color[]; any: boolean };

const STREETS: Record<Color, string[]> = {
  brown: ["Mud Lane", "Cheap Street"],
  lightBlue: ["Brunch Row", "Oat Milk Ave", "Vinyl Street"],
  pink: ["Flamingo Way", "Rosé Terrace", "Glitter Court"],
  orange: ["Tangerine Blvd", "Spritz Place", "Sunset Strip"],
  red: ["Hot Sauce Road", "Lipstick Lane", "Ruby Square"],
  yellow: ["Lemon Drop", "Banana Walk", "Gold Rush Ave"],
  green: ["Money Tree Lane", "Emerald Park", "Mojito Mile"],
  darkBlue: ["Penthouse Place", "Yacht Club Pier"],
  railroad: ["North Station", "South Station", "East Station", "West Station"],
  utility: ["Power Co.", "Water Works"],
};

const PROPERTY_VALUE: Record<Color, number> = {
  brown: 1,
  lightBlue: 1,
  pink: 2,
  orange: 2,
  red: 3,
  yellow: 3,
  green: 4,
  darkBlue: 4,
  railroad: 2,
  utility: 2,
};

const ACTIONS: { action: ActionKind; name: string; value: number; count: number; text: string }[] = [
  { action: "dealBreaker", name: "Deal Breaker", value: 5, count: 2, text: "Steal a full set (with its buildings)." },
  { action: "justSayNo", name: "Just Say No", value: 4, count: 3, text: "Cancel an action played against you." },
  { action: "slyDeal", name: "Sly Deal", value: 3, count: 3, text: "Steal one property that isn't part of a full set." },
  { action: "forcedDeal", name: "Forced Deal", value: 3, count: 3, text: "Swap one of your properties for one of theirs." },
  { action: "debtCollector", name: "Debt Collector", value: 3, count: 3, text: "One player pays you $5M." },
  { action: "birthday", name: "It's My Birthday", value: 2, count: 3, text: "Everyone pays you $2M." },
  { action: "passGo", name: "Pass Go", value: 1, count: 10, text: "Draw 2 extra cards." },
  { action: "house", name: "House", value: 3, count: 3, text: "Add to a full set: +$3M rent." },
  { action: "hotel", name: "Hotel", value: 4, count: 2, text: "Add to a full set with a house: +$4M rent." },
  { action: "doubleRent", name: "Double the Rent", value: 1, count: 2, text: "Play with a rent card to double it." },
];

function build(): CardDef[] {
  const out: CardDef[] = [];
  const id = () => `pd${out.length + 1}`;
  for (const [value, count] of [
    [1, 6],
    [2, 5],
    [3, 3],
    [4, 3],
    [5, 2],
    [10, 1],
  ] as const) {
    for (let i = 0; i < count; i++) out.push({ id: id(), kind: "money", value, name: `$${value}M` });
  }
  for (const a of ACTIONS) {
    for (let i = 0; i < a.count; i++)
      out.push({ id: id(), kind: "action", value: a.value, name: a.name, action: a.action, text: a.text });
  }
  for (const pair of [
    ["brown", "lightBlue"],
    ["pink", "orange"],
    ["red", "yellow"],
    ["green", "darkBlue"],
    ["railroad", "utility"],
  ] as [Color, Color][]) {
    for (let i = 0; i < 2; i++) out.push({ id: id(), kind: "rent", value: 1, name: "Rent", colors: pair, any: false });
  }
  for (let i = 0; i < 3; i++) out.push({ id: id(), kind: "rent", value: 3, name: "Wild Rent", colors: [...COLORS], any: true });
  for (const color of COLORS) {
    for (const street of STREETS[color])
      out.push({ id: id(), kind: "property", value: PROPERTY_VALUE[color], name: street, color });
  }
  const wilds: [Color[], number, number][] = [
    [["darkBlue", "green"], 4, 1],
    [["green", "railroad"], 4, 1],
    [["utility", "railroad"], 2, 1],
    [["lightBlue", "railroad"], 4, 1],
    [["lightBlue", "brown"], 1, 1],
    [["pink", "orange"], 2, 2],
    [["red", "yellow"], 3, 2],
    [[...COLORS], 0, 2],
  ];
  for (const [colors, value, count] of wilds) {
    for (let i = 0; i < count; i++) {
      out.push({
        id: id(),
        kind: "wild",
        value,
        name: colors.length > 2 ? "Rainbow Wild" : `${COLOR_INFO[colors[0]!].name} / ${COLOR_INFO[colors[1]!].name} Wild`,
        colors,
      });
    }
  }
  return out;
}

export const DECK: readonly CardDef[] = build();
export const CARD_BY_ID: ReadonlyMap<string, CardDef> = new Map(DECK.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`Unknown card ${id}`);
  return c;
}

export const isPropertyCard = (id: string) => {
  const k = card(id).kind;
  return k === "property" || k === "wild";
};

/** Colours a property card may sit in. */
export function colorsOf(id: string): Color[] {
  const c = card(id);
  if (c.kind === "property") return [c.color];
  if (c.kind === "wild") return c.colors;
  return [];
}

export function isAction(id: string, action: ActionKind): boolean {
  const c = card(id);
  return c.kind === "action" && c.action === action;
}

export function rentFor(count: number, color: Color): number {
  if (count <= 0) return 0;
  const table = COLOR_INFO[color].rent;
  return table[Math.min(count, table.length) - 1]!;
}

export function money(n: number): string {
  return `$${n}M`;
}
