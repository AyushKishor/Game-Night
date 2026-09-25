/** A 40-space Monopoly-style board with the classic prices and rents. */

export type Group = "brown" | "lightBlue" | "pink" | "orange" | "red" | "yellow" | "green" | "darkBlue";

export type Space =
  | { i: number; kind: "go" | "jail" | "parking" | "goToJail"; name: string }
  | { i: number; kind: "chance" | "chest"; name: string }
  | { i: number; kind: "tax"; name: string; amount: number }
  | { i: number; kind: "street"; name: string; group: Group; price: number; rent: number[]; house: number }
  | { i: number; kind: "railroad" | "utility"; name: string; price: number };

export const GROUP_HEX: Record<Group, string> = {
  brown: "#8b5a2b",
  lightBlue: "#8fd3f4",
  pink: "#e0529c",
  orange: "#f58b1f",
  red: "#e23b3b",
  yellow: "#f5d31b",
  green: "#1f9d55",
  darkBlue: "#2446b8",
};

const street = (i: number, name: string, group: Group, price: number, rent: number[], house: number): Space => ({
  i,
  kind: "street",
  name,
  group,
  price,
  rent,
  house,
});

export const BOARD: Space[] = [
  { i: 0, kind: "go", name: "GO" },
  street(1, "Mud Lane", "brown", 60, [2, 10, 30, 90, 160, 250], 50),
  { i: 2, kind: "chest", name: "Treasure Chest" },
  street(3, "Cheap Street", "brown", 60, [4, 20, 60, 180, 320, 450], 50),
  { i: 4, kind: "tax", name: "Income Tax", amount: 200 },
  { i: 5, kind: "railroad", name: "North Station", price: 200 },
  street(6, "Brunch Row", "lightBlue", 100, [6, 30, 90, 270, 400, 550], 50),
  { i: 7, kind: "chance", name: "Chance" },
  street(8, "Oat Milk Ave", "lightBlue", 100, [6, 30, 90, 270, 400, 550], 50),
  street(9, "Vinyl Street", "lightBlue", 120, [8, 40, 100, 300, 450, 600], 50),
  { i: 10, kind: "jail", name: "Jail" },
  street(11, "Flamingo Way", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  { i: 12, kind: "utility", name: "Power Co.", price: 150 },
  street(13, "Rosé Terrace", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  street(14, "Glitter Court", "pink", 160, [12, 60, 180, 500, 700, 900], 100),
  { i: 15, kind: "railroad", name: "East Station", price: 200 },
  street(16, "Tangerine Blvd", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  { i: 17, kind: "chest", name: "Treasure Chest" },
  street(18, "Spritz Place", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  street(19, "Sunset Strip", "orange", 200, [16, 80, 220, 600, 800, 1000], 100),
  { i: 20, kind: "parking", name: "Free Parking" },
  street(21, "Hot Sauce Road", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  { i: 22, kind: "chance", name: "Chance" },
  street(23, "Lipstick Lane", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  street(24, "Ruby Square", "red", 240, [20, 100, 300, 750, 925, 1100], 150),
  { i: 25, kind: "railroad", name: "South Station", price: 200 },
  street(26, "Lemon Drop", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  street(27, "Banana Walk", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  { i: 28, kind: "utility", name: "Water Works", price: 150 },
  street(29, "Gold Rush Ave", "yellow", 280, [24, 120, 360, 850, 1025, 1200], 150),
  { i: 30, kind: "goToJail", name: "Go To Jail" },
  street(31, "Money Tree Lane", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  street(32, "Emerald Park", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  { i: 33, kind: "chest", name: "Treasure Chest" },
  street(34, "Mojito Mile", "green", 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { i: 35, kind: "railroad", name: "West Station", price: 200 },
  { i: 36, kind: "chance", name: "Chance" },
  street(37, "Penthouse Place", "darkBlue", 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { i: 38, kind: "tax", name: "Luxury Tax", amount: 100 },
  street(39, "Yacht Club Pier", "darkBlue", 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export type Buyable = Extract<Space, { price: number }>;
export const isBuyable = (s: Space): s is Buyable => "price" in s;
export const GROUP_SPACES: Record<Group, number[]> = BOARD.reduce(
  (acc, s) => {
    if (s.kind === "street") (acc[s.group] ??= []).push(s.i);
    return acc;
  },
  {} as Record<Group, number[]>,
);
export const JAIL = 10;

export type CardOp =
  | { t: "money"; amount: number }
  | { t: "move"; to: number }
  | { t: "back"; n: number }
  | { t: "jail" }
  | { t: "jailFree" }
  | { t: "nearest"; kind: "railroad" | "utility" }
  | { t: "each"; amount: number }
  | { t: "repairs"; house: number; hotel: number };

export interface DeckCard {
  text: string;
  op: CardOp;
}

export const CHANCE: DeckCard[] = [
  { text: "Advance to GO. Collect $200.", op: { t: "move", to: 0 } },
  { text: "You matched with someone on Ruby Square. Advance there.", op: { t: "move", to: 24 } },
  { text: "Brunch reservation on Flamingo Way. Advance there.", op: { t: "move", to: 11 } },
  { text: "Uber to the nearest utility. If owned, pay 10× the dice.", op: { t: "nearest", kind: "utility" } },
  {
    text: "Late-night train home: go to the nearest station. If owned, pay double rent.",
    op: { t: "nearest", kind: "railroad" },
  },
  { text: "Missed the last train — nearest station. If owned, pay double rent.", op: { t: "nearest", kind: "railroad" } },
  { text: "Your crypto finally pumped. Collect $50.", op: { t: "money", amount: 50 } },
  { text: "Get Out of Jail Free — your ex's cousin is a lawyer.", op: { t: "jailFree" } },
  { text: "Forgot your phone at the bar. Go back 3 spaces.", op: { t: "back", n: 3 } },
  { text: "Public urination. Go directly to Jail.", op: { t: "jail" } },
  { text: "Your parties wrecked the place: $25 per house, $100 per hotel.", op: { t: "repairs", house: 25, hotel: 100 } },
  { text: "Speeding to the afterparty. Pay $15.", op: { t: "money", amount: -15 } },
  { text: "Road trip! Take a ride to North Station.", op: { t: "move", to: 5 } },
  { text: "Yacht week invite. Advance to Yacht Club Pier.", op: { t: "move", to: 39 } },
  { text: "You lost a drinking bet. Pay each player $50.", op: { t: "each", amount: -50 } },
  { text: "Your OnlyFans took off. Collect $150.", op: { t: "money", amount: 150 } },
];

export const CHEST: DeckCard[] = [
  { text: "Advance to GO. Collect $200.", op: { t: "move", to: 0 } },
  { text: "Bank error in your favour. Collect $200.", op: { t: "money", amount: 200 } },
  { text: "Hangover IV drip. Pay $50.", op: { t: "money", amount: -50 } },
  { text: "Sold your old concert tickets. Collect $50.", op: { t: "money", amount: 50 } },
  { text: "Get Out of Jail Free — the bouncer owes you one.", op: { t: "jailFree" } },
  { text: "Bar fight. Go directly to Jail.", op: { t: "jail" } },
  { text: "Your sugar daddy came through. Collect $100.", op: { t: "money", amount: 100 } },
  { text: "Tax refund. Collect $20.", op: { t: "money", amount: 20 } },
  { text: "It's your birthday! Collect $10 from every player.", op: { t: "each", amount: 10 } },
  { text: "Won the office fantasy league. Collect $100.", op: { t: "money", amount: 100 } },
  { text: "Emergency room after the kegstand. Pay $100.", op: { t: "money", amount: -100 } },
  { text: "Bottle service minimum. Pay $50.", op: { t: "money", amount: -50 } },
  { text: "Wingman fee. Collect $25.", op: { t: "money", amount: 25 } },
  { text: "Neighbours complained about the noise: $40 per house, $115 per hotel.", op: { t: "repairs", house: 40, hotel: 115 } },
  { text: "Second place in a wet T-shirt contest. Collect $10.", op: { t: "money", amount: 10 } },
  { text: "Your rich aunt left you her wine cellar. Collect $100.", op: { t: "money", amount: 100 } },
];
