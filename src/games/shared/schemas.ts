import { z } from "zod";
import { SUITS, isCardId, RANKS } from "@/lib/engine/cards";

export const cardSchema = z.string().refine(isCardId, "Invalid card");
export const suitSchema = z.enum(SUITS);
export const rankSchema = z.enum(RANKS);
export const playerIdSchema = z.string().min(1).max(64);
