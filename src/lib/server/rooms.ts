import { createHash, randomBytes, randomUUID, randomInt } from "node:crypto";
import { content } from "@/content";
import { GAMES, getGame } from "@/games";
import { DEFAULT_CONFIG } from "@/lib/engine/helpers";
import { createRng } from "@/lib/engine/rng";
import { advance, nextWakeAt, startGame, submitAction, viewCtx, type RunnerEnv } from "@/lib/engine/runner";
import type { AnyGameModule, GameConfig, PlayerId, PresetId } from "@/lib/engine/types";
import {
  AVATARS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Command,
  type RoomPreview,
  type StateResponse,
} from "@/lib/shared/protocol";
import { cleanText, sanitizeNickname } from "@/lib/shared/text";
import type { PlayerRecord, RoomDoc, RoomStore, RoundRecord } from "./types";

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface RoomServiceOptions {
  store: RoomStore;
  now?: () => number;
  /** Pause between automated moves. */
  botDelayMs?: number;
  /** Rooms with no activity for this long expire. */
  roomIdleMs?: number;
  sessionTtlMs?: number;
  /** A player is "connected" if seen within this window. */
  presenceTimeoutMs?: number;
  /** The server plays for a disconnected player after this long. */
  autopilotAfterMs?: number;
  /** Host role moves to someone else after the host has been gone this long. */
  hostGraceMs?: number;
  publish?: (channel: string, version: number) => void | Promise<void>;
}

const BOT_NAMES = ["Ada", "Blip", "Cogsworth", "Dot", "Echo", "Fizz", "Gizmo", "Hex", "Ion", "Jolt", "Kilo", "Lumen"];
const HANDOFF_TTL_MS = 2 * 60_000;
const RECENT_ACTIONS = 300;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function newPlayerId(): string {
  return `p_${randomBytes(9).toString("base64url")}`;
}

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export function channelFor(roomId: string): string {
  return `gn-room-${roomId}`;
}

function configFor(game: AnyGameModule | undefined, preset: PresetId): GameConfig {
  const houseRules = Object.fromEntries((game?.houseRules ?? []).map((r) => [r.key, r.default]));
  return { ...DEFAULT_CONFIG, ...(game?.presets[preset] ?? {}), houseRules };
}

function uniqueName(desired: string, room: RoomDoc, exceptId?: PlayerId): string {
  const taken = new Set(room.players.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
  if (!taken.has(desired.toLowerCase())) return desired;
  for (let i = 2; i < 100; i++) {
    const candidate = `${desired.slice(0, 13)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${desired.slice(0, 10)} ${randomInt(1000)}`;
}

export class RoomService {
  readonly store: RoomStore;
  private now: () => number;
  readonly botDelayMs: number;
  readonly roomIdleMs: number;
  private sessionTtlMs: number;
  private presenceTimeoutMs: number;
  private autopilotAfterMs: number;
  private hostGraceMs: number;
  private publish: (channel: string, version: number) => void | Promise<void>;

  constructor(opts: RoomServiceOptions) {
    this.store = opts.store;
    this.now = opts.now ?? Date.now;
    this.botDelayMs = opts.botDelayMs ?? 1200;
    this.roomIdleMs = opts.roomIdleMs ?? 180 * 60_000;
    this.sessionTtlMs = opts.sessionTtlMs ?? 24 * 60 * 60_000;
    this.presenceTimeoutMs = opts.presenceTimeoutMs ?? 25_000;
    this.autopilotAfterMs = opts.autopilotAfterMs ?? 40_000;
    this.hostGraceMs = opts.hostGraceMs ?? 60_000;
    this.publish = opts.publish ?? (() => {});
  }

  // ───────────────────────────── public API ─────────────────────────────

  async createRoom(input: { name: string; avatar?: string }): Promise<StateResponse & { token: string }> {
    const name = sanitizeNickname(input.name);
    if (!name) throw new RoomError("bad_name", "Please choose a different nickname.", 422);
    const now = this.now();
    const host = this.makePlayer(name, input.avatar, now);
    for (let attempt = 0; attempt < 8; attempt++) {
      const room: RoomDoc = {
        id: randomUUID(),
        code: generateRoomCode(),
        createdAt: now,
        activeAt: now,
        version: 1,
        hostId: host.id,
        locked: false,
        allowSpectators: true,
        players: [host],
        formerNames: {},
        phase: "lobby",
        selectedGameId: null,
        preset: "standard",
        config: configFor(undefined, "standard"),
        game: null,
        recordedRounds: 0,
        lastResults: null,
        history: [],
        log: [{ t: now, text: `${name} opened the room.` }],
        recentActionIds: [],
        handoffs: [],
        botCounter: 0,
      };
      if (await this.store.insertRoom(room)) {
        const token = await this.issueSession(room, host.id, now);
        return { token, ...this.buildState(room, host.id, now) };
      }
    }
    throw new RoomError("unavailable", "Couldn't create a room right now. Please try again.", 503);
  }

  async preview(rawCode: string): Promise<RoomPreview> {
    const code = rawCode.toUpperCase();
    const room = await this.store.getRoom(code);
    const now = this.now();
    if (!room) throw new RoomError("room_not_found", "We couldn't find a room with that code. Check the code and try again.", 404);
    if (this.isExpired(room, now)) {
      await this.expire(code);
      throw new RoomError("room_expired", "That room has expired. Ask the host to start a new one.", 410);
    }
    const seated = room.players.filter((p) => !p.isSpectator);
    return {
      code: room.code,
      exists: true,
      phase: room.phase,
      locked: room.locked,
      full: seated.length >= MAX_PLAYERS,
      allowSpectators: room.allowSpectators,
      playerCount: seated.length,
      hostName: room.players.find((p) => p.id === room.hostId)?.name ?? "Host",
      gameName: getGame(room.selectedGameId)?.meta.name ?? null,
    };
  }

  async join(
    rawCode: string,
    input: { name: string; avatar?: string; spectator?: boolean },
  ): Promise<StateResponse & { token: string }> {
    const code = rawCode.toUpperCase();
    const name = sanitizeNickname(input.name);
    if (!name) throw new RoomError("bad_name", "Please choose a different nickname.", 422);
    const now = this.now();
    let joinedId: PlayerId | null = null;
    const res = await this.store.mutateRoom(code, (room) => {
      if (this.isExpired(room, now)) return { room: null, result: "expired" as const, changed: true };
      if (room.locked) throw new RoomError("room_locked", "This room is locked. Ask the host to unlock it.", 423);
      const seated = room.players.filter((p) => !p.isSpectator).length;
      const spectators = room.players.filter((p) => p.isSpectator).length;
      const spectator = input.spectator ?? false;
      if (spectator && !room.allowSpectators) {
        throw new RoomError("no_spectators", "The host has turned off spectators for this room.", 403);
      }
      if (!spectator && seated >= MAX_PLAYERS) {
        throw new RoomError("room_full", `This room is full (${MAX_PLAYERS} players).`, 409);
      }
      if (spectator && spectators >= MAX_SPECTATORS) {
        throw new RoomError("room_full", "There's no more space for spectators.", 409);
      }
      const player = this.makePlayer(uniqueName(name, room), input.avatar, now);
      player.isSpectator = spectator;
      room.players.push(player);
      joinedId = player.id;
      this.addLog(room, now, `${player.name} joined${spectator ? " as a spectator" : ""}.`);
      // Late joiners join party games in progress when the host allows it.
      if (!spectator && room.phase === "playing" && room.game) {
        const game = getGame(room.game.gameId);
        if (game?.addPlayer && room.game.config.allowJoinInProgress && room.game.players.length < game.meta.maxPlayers) {
          const env = this.runnerEnv(room, now);
          const state = game.addPlayer(room.game.state, player.id, {
            ...viewCtx(room.game, env),
            rng: createRng(`${room.game.seed}:join:${player.id}`),
          });
          room.game = { ...room.game, state, players: [...room.game.players, player.id], step: room.game.step + 1 };
        }
      }
      this.touch(room, now);
      return { room, result: "ok" as const, changed: true };
    });
    if (!res.found) throw new RoomError("room_not_found", "We couldn't find a room with that code. Check the code and try again.", 404);
    if (res.result === "expired" || !res.room) {
      throw new RoomError("room_expired", "That room has expired. Ask the host to start a new one.", 410);
    }
    this.notify(res.room);
    const token = await this.issueSession(res.room, joinedId!, now);
    return { token, ...this.buildState(res.room, joinedId!, now) };
  }

  /** Heartbeat + timers + bots, then the caller's filtered view of the room. */
  async sync(rawCode: string, token: string): Promise<StateResponse> {
    const { code, playerId } = await this.authenticate(rawCode, token);
    const now = this.now();
    const res = await this.mutate(code, now, (room) => {
      const me = room.players.find((p) => p.id === playerId);
      if (!me) throw new RoomError("not_in_room", "You're no longer in this room.", 403);
      let changed = false;
      if (now - me.lastSeen > 4000) {
        me.lastSeen = now;
        changed = true;
      }
      return { changed, meaningful: false };
    });
    return this.buildState(res, playerId, now);
  }

  async command(rawCode: string, token: string, cmd: Command): Promise<StateResponse & { duplicate?: boolean }> {
    const { code, playerId } = await this.authenticate(rawCode, token);
    const now = this.now();
    let duplicate = false;
    let left = false;
    const room = await this.mutate(code, now, (room) => {
      const me = room.players.find((p) => p.id === playerId);
      if (!me) throw new RoomError("not_in_room", "You're no longer in this room.", 403);
      me.lastSeen = now;
      if (room.recentActionIds.includes(cmd.actionId)) {
        duplicate = true;
        return { changed: true, meaningful: false };
      }
      this.applyCommand(room, me, cmd, now);
      room.recentActionIds = [...room.recentActionIds, cmd.actionId].slice(-RECENT_ACTIONS);
      if (cmd.kind === "leave") left = true;
      this.touch(room, now);
      return { changed: true, meaningful: true };
    });
    if (left) {
      await this.store.deleteSessions(room.id, playerId);
      throw new RoomError("left", "You left the room.", 410);
    }
    if (cmd.kind === "kick") await this.store.deleteSessions(room.id, cmd.playerId);
    return { ...this.buildState(room, playerId, now), duplicate };
  }

  /** One-time link that signs the same player in on another device. */
  async createHandoff(rawCode: string, token: string): Promise<{ handoff: string; expiresAt: number }> {
    const { code, playerId } = await this.authenticate(rawCode, token);
    const now = this.now();
    const handoff = randomBytes(12).toString("base64url");
    const expiresAt = now + HANDOFF_TTL_MS;
    await this.mutate(code, now, (room) => {
      room.handoffs = [
        ...room.handoffs.filter((h) => h.expiresAt > now && h.playerId !== playerId),
        { codeHash: hashToken(handoff), playerId, expiresAt },
      ];
      return { changed: true, meaningful: false };
    });
    return { handoff, expiresAt };
  }

  async redeemHandoff(rawCode: string, handoff: string): Promise<StateResponse & { token: string }> {
    const code = rawCode.toUpperCase();
    const now = this.now();
    let playerId: PlayerId | null = null;
    const room = await this.mutate(code, now, (room) => {
      const h = room.handoffs.find((x) => x.codeHash === hashToken(handoff) && x.expiresAt > now);
      if (!h || !room.players.some((p) => p.id === h.playerId)) {
        throw new RoomError("handoff_invalid", "That device link has expired. Create a new one.", 410);
      }
      playerId = h.playerId;
      room.handoffs = room.handoffs.filter((x) => x !== h);
      return { changed: true, meaningful: false };
    });
    const token = await this.issueSession(room, playerId!, now);
    return { token, ...this.buildState(room, playerId!, now) };
  }

  async cleanup(): Promise<number> {
    const now = this.now();
    return this.store.cleanup(now - this.roomIdleMs, now);
  }

  // ───────────────────────────── internals ─────────────────────────────

  private async authenticate(rawCode: string, token: string) {
    const code = rawCode.toUpperCase();
    if (!token) throw new RoomError("unauthorized", "Please join the room first.", 401);
    const session = await this.store.getSession(hashToken(token));
    if (!session || session.expiresAt < this.now()) {
      throw new RoomError("unauthorized", "Your session has expired. Please rejoin the room.", 401);
    }
    return { code, playerId: session.playerId, roomId: session.roomId };
  }

  private async issueSession(room: RoomDoc, playerId: PlayerId, now: number) {
    const token = newToken();
    await this.store.insertSession({
      tokenHash: hashToken(token),
      roomId: room.id,
      playerId,
      expiresAt: now + this.sessionTtlMs,
    });
    return token;
  }

  private makePlayer(name: string, avatar: string | undefined, now: number): PlayerRecord {
    return {
      id: newPlayerId(),
      name,
      avatar: avatar && (AVATARS as readonly string[]).includes(avatar) ? avatar : AVATARS[randomInt(AVATARS.length)]!,
      isBot: false,
      isSpectator: false,
      ready: false,
      joinedAt: now,
      lastSeen: now,
      points: 0,
      wins: 0,
      gamesPlayed: 0,
    };
  }

  private isExpired(room: RoomDoc, now: number) {
    return now - room.activeAt > this.roomIdleMs;
  }

  private async expire(code: string) {
    await this.store.mutateRoom(code, () => ({ room: null, result: null, changed: true }));
  }

  private touch(room: RoomDoc, now: number) {
    room.activeAt = now;
  }

  private addLog(room: RoomDoc, now: number, text: string) {
    room.log = [...room.log, { t: now, text: cleanText(text, 200) }].slice(-40);
  }

  private isConnected(p: PlayerRecord, now: number) {
    return p.isBot || now - p.lastSeen < this.presenceTimeoutMs;
  }

  private runnerEnv(room: RoomDoc, now: number): RunnerEnv {
    const names: Record<PlayerId, string> = { ...room.formerNames };
    for (const p of room.players) names[p.id] = p.name;
    const present = new Map(room.players.map((p) => [p.id, p]));
    const autopilot = new Set<PlayerId>();
    for (const id of room.game?.players ?? []) {
      const p = present.get(id);
      if (!p || p.isBot || now - p.lastSeen > this.autopilotAfterMs) autopilot.add(id);
    }
    return { now, hostId: room.hostId, names, content, autopilot, botDelayMs: this.botDelayMs };
  }

  /**
   * Locked read-modify-write wrapper: expiry, presence, host transfer, game
   * timers and bot moves all run here before/after the caller's change.
   */
  private async mutate(
    code: string,
    now: number,
    fn: (room: RoomDoc) => { changed: boolean; meaningful: boolean },
  ): Promise<RoomDoc> {
    const newRounds: RoundRecord[] = [];
    const res = await this.store.mutateRoom(code, (room) => {
      if (this.isExpired(room, now)) return { room: null, result: { meaningful: true }, changed: true };
      const before = JSON.stringify(room);
      const out = fn(room);
      const maintained = this.maintain(room, now, newRounds);
      const meaningful = out.meaningful || maintained;
      if (meaningful) room.version += 1;
      const changed = out.changed || meaningful || JSON.stringify(room) !== before;
      return { room, result: { meaningful }, changed };
    });
    if (!res.found) throw new RoomError("room_not_found", "We couldn't find that room. It may have been closed.", 404);
    if (!res.room) throw new RoomError("room_expired", "This room has expired. Ask the host to start a new one.", 410);
    if (newRounds.length) await this.store.insertRounds(newRounds).catch(() => {});
    if (res.result.meaningful) this.notify(res.room);
    return res.room;
  }

  private notify(room: RoomDoc) {
    try {
      void Promise.resolve(this.publish(channelFor(room.id), room.version)).catch(() => {});
    } catch {
      /* realtime is best-effort; clients also poll */
    }
  }

  /** Returns true if anything players can see changed. */
  private maintain(room: RoomDoc, now: number, newRounds: RoundRecord[]): boolean {
    let meaningful = false;
    // Host transfer when the host has been gone for a while.
    const host = room.players.find((p) => p.id === room.hostId);
    if (!host || now - host.lastSeen > this.hostGraceMs) {
      const candidate =
        room.players.find((p) => !p.isBot && !p.isSpectator && this.isConnected(p, now) && p.id !== room.hostId) ??
        room.players.find((p) => !p.isBot && this.isConnected(p, now) && p.id !== room.hostId);
      if (candidate) {
        room.hostId = candidate.id;
        this.addLog(room, now, `${candidate.name} is now the host.`);
        meaningful = true;
      }
    }
    // Game timers and automated moves.
    if (room.phase === "playing" && room.game) {
      const game = getGame(room.game.gameId);
      if (game) {
        const beforeStep = room.game.step;
        room.game = advance(game, room.game, this.runnerEnv(room, now));
        if (room.game.step !== beforeStep) meaningful = true;
        this.collectRounds(room, game, newRounds, now);
        if (game.isOver(room.game.state)) {
          this.finishGame(room, game, now);
          meaningful = true;
        }
      }
    }
    return meaningful;
  }

  private collectRounds(room: RoomDoc, game: AnyGameModule, out: RoundRecord[], now: number) {
    if (!room.game) return;
    const summaries = game.roundSummaries(room.game.state);
    for (let i = room.recordedRounds; i < summaries.length; i++) {
      out.push({ roomId: room.id, gameId: game.meta.id, round: summaries[i]!.round, summary: summaries[i], createdAt: now });
    }
    room.recordedRounds = summaries.length;
  }

  private finishGame(room: RoomDoc, game: AnyGameModule, now: number) {
    if (!room.game) return;
    const env = this.runnerEnv(room, now);
    const results = game.results(room.game.state, viewCtx(room.game, env));
    const awarded: Record<PlayerId, number> = {};
    for (const s of results.standings) {
      const beaten = results.standings.filter((o) => o.place > s.place).length;
      const pts = beaten + (s.place === 1 ? 2 : 0);
      awarded[s.playerId] = pts;
      const p = room.players.find((x) => x.id === s.playerId);
      if (p) {
        p.points += pts;
        p.gamesPlayed += 1;
        if (s.place === 1) p.wins += 1;
      }
    }
    room.lastResults = { gameId: game.meta.id, standings: results.standings, summary: results.summary, awarded, finishedAt: now };
    room.history = [
      ...room.history,
      {
        gameId: game.meta.id,
        finishedAt: now,
        winners: results.standings.filter((s) => s.place === 1).map((s) => env.names[s.playerId] ?? "Player"),
      },
    ].slice(-50);
    room.phase = "results";
    this.addLog(room, now, `${game.meta.name} finished. ${results.summary}`);
    for (const p of room.players) if (!p.isBot) p.ready = false;
  }

  private requireHost(room: RoomDoc, me: PlayerRecord) {
    if (room.hostId !== me.id) throw new RoomError("not_host", "Only the host can do that.", 403);
  }

  private startSelectedGame(room: RoomDoc, now: number) {
    const game = getGame(room.selectedGameId);
    if (!game) throw new RoomError("no_game", "Choose a game first.", 409);
    const seated = room.players.filter((p) => !p.isSpectator);
    if (seated.length < game.meta.minPlayers) {
      throw new RoomError("too_few_players", `${game.meta.name} needs at least ${game.meta.minPlayers} players.`, 409);
    }
    if (seated.length > game.meta.maxPlayers) {
      throw new RoomError(
        "too_many_players",
        `${game.meta.name} allows up to ${game.meta.maxPlayers} players. Ask some people to spectate.`,
        409,
      );
    }
    const env = this.runnerEnv(room, now);
    room.game = startGame(game, seated.map((p) => p.id), room.config, env);
    room.recordedRounds = 0;
    room.phase = "playing";
    room.lastResults = null;
    this.addLog(room, now, `${game.meta.name} started.`);
  }

  private applyCommand(room: RoomDoc, me: PlayerRecord, cmd: Command, now: number) {
    switch (cmd.kind) {
      case "ready": {
        if (room.phase === "playing") throw new RoomError("wrong_phase", "The game has already started.", 409);
        if (me.isSpectator) throw new RoomError("spectator", "Spectators don't need to ready up.", 409);
        me.ready = cmd.ready;
        return;
      }
      case "selectGame": {
        this.requireHost(room, me);
        if (room.phase === "playing") throw new RoomError("wrong_phase", "Finish or end the current game first.", 409);
        const game = getGame(cmd.gameId);
        if (!game) throw new RoomError("unknown_game", "That game isn't available yet.", 422);
        room.selectedGameId = game.meta.id;
        room.preset = "standard";
        room.config = configFor(game, "standard");
        room.phase = "lobby";
        this.addLog(room, now, `${me.name} picked ${game.meta.name}.`);
        return;
      }
      case "configure": {
        this.requireHost(room, me);
        if (room.phase === "playing") throw new RoomError("wrong_phase", "Settings are locked during a game.", 409);
        const game = getGame(room.selectedGameId);
        if (cmd.preset) {
          room.config = configFor(game, cmd.preset);
          room.preset = cmd.preset;
        }
        if (cmd.config) {
          const allowedRules = new Set((game?.houseRules ?? []).map((r) => r.key));
          const houseRules = { ...room.config.houseRules };
          for (const [k, v] of Object.entries(cmd.config.houseRules ?? {})) if (allowedRules.has(k)) houseRules[k] = v;
          room.config = { ...room.config, ...cmd.config, houseRules };
          room.preset = "custom";
        }
        return;
      }
      case "start": {
        this.requireHost(room, me);
        if (room.phase === "playing") throw new RoomError("wrong_phase", "A game is already running.", 409);
        const notReady = room.players.filter((p) => !p.isSpectator && !p.isBot && !p.ready && p.id !== room.hostId);
        if (notReady.length) {
          throw new RoomError(
            "not_ready",
            `Waiting for ${notReady.map((p) => p.name).join(", ")} to get ready.`,
            409,
          );
        }
        this.startSelectedGame(room, now);
        return;
      }
      case "rematch": {
        this.requireHost(room, me);
        if (room.phase !== "results") throw new RoomError("wrong_phase", "Rematch is available after a game ends.", 409);
        this.startSelectedGame(room, now);
        return;
      }
      case "game": {
        if (room.phase !== "playing" || !room.game) throw new RoomError("no_game_running", "There's no game running.", 409);
        const game = getGame(room.game.gameId)!;
        const res = submitAction(game, room.game, me.id, cmd.action, this.runnerEnv(room, now));
        if (!res.ok) throw new RoomError(res.code, res.error, res.code === "bad_payload" ? 422 : 409);
        room.game = res.envelope;
        return;
      }
      case "toLobby":
      case "endGame": {
        this.requireHost(room, me);
        if (cmd.kind === "endGame" && room.phase === "playing") this.addLog(room, now, `${me.name} ended the game early.`);
        room.phase = "lobby";
        room.game = null;
        for (const p of room.players) if (!p.isBot) p.ready = false;
        return;
      }
      case "kick": {
        this.requireHost(room, me);
        const target = room.players.find((p) => p.id === cmd.playerId);
        if (!target) throw new RoomError("unknown_player", "That player isn't in the room.", 404);
        if (target.id === me.id) throw new RoomError("invalid", "You can't remove yourself — use Leave instead.", 409);
        this.removePlayer(room, target, now, `${target.name} was removed by the host.`);
        return;
      }
      case "lock": {
        this.requireHost(room, me);
        room.locked = cmd.locked;
        this.addLog(room, now, cmd.locked ? "The room is locked." : "The room is open again.");
        return;
      }
      case "allowSpectators": {
        this.requireHost(room, me);
        room.allowSpectators = cmd.allow;
        return;
      }
      case "addBot": {
        this.requireHost(room, me);
        if (room.phase === "playing") throw new RoomError("wrong_phase", "Add bots between games.", 409);
        if (room.players.filter((p) => !p.isSpectator).length >= MAX_PLAYERS) {
          throw new RoomError("room_full", "The room is full.", 409);
        }
        const name = uniqueName(`Bot ${BOT_NAMES[room.botCounter % BOT_NAMES.length]}`, room);
        room.botCounter += 1;
        const bot = this.makePlayer(name, undefined, now);
        bot.avatar = "🤖";
        bot.isBot = true;
        bot.ready = true;
        room.players.push(bot);
        this.addLog(room, now, `${name} joined.`);
        return;
      }
      case "removeBot": {
        this.requireHost(room, me);
        const bot = room.players.find((p) => p.id === cmd.playerId && p.isBot);
        if (!bot) throw new RoomError("unknown_player", "That bot isn't here.", 404);
        this.removePlayer(room, bot, now, `${bot.name} left.`);
        return;
      }
      case "transferHost": {
        this.requireHost(room, me);
        const target = room.players.find((p) => p.id === cmd.playerId && !p.isBot);
        if (!target) throw new RoomError("unknown_player", "Pick a human player.", 404);
        room.hostId = target.id;
        this.addLog(room, now, `${target.name} is now the host.`);
        return;
      }
      case "setSpectator": {
        if (room.phase === "playing" && room.game?.players.includes(me.id)) {
          throw new RoomError("wrong_phase", "You can switch to spectating after this game.", 409);
        }
        if (cmd.spectator && !room.allowSpectators) throw new RoomError("no_spectators", "Spectators are turned off.", 403);
        if (!cmd.spectator && room.players.filter((p) => !p.isSpectator).length >= MAX_PLAYERS) {
          throw new RoomError("room_full", "All player seats are taken.", 409);
        }
        me.isSpectator = cmd.spectator;
        me.ready = false;
        return;
      }
      case "updateProfile": {
        if (cmd.name !== undefined) {
          const name = sanitizeNickname(cmd.name);
          if (!name) throw new RoomError("bad_name", "Please choose a different nickname.", 422);
          me.name = uniqueName(name, room, me.id);
        }
        if (cmd.avatar) me.avatar = cmd.avatar;
        return;
      }
      case "leave": {
        this.removePlayer(room, me, now, `${me.name} left.`);
        return;
      }
    }
  }

  private removePlayer(room: RoomDoc, target: PlayerRecord, now: number, message: string) {
    room.players = room.players.filter((p) => p.id !== target.id);
    room.formerNames[target.id] = target.name;
    room.handoffs = room.handoffs.filter((h) => h.playerId !== target.id);
    this.addLog(room, now, message);
    if (room.hostId === target.id) {
      const next = room.players.find((p) => !p.isBot && !p.isSpectator) ?? room.players.find((p) => !p.isBot);
      if (next) {
        room.hostId = next.id;
        this.addLog(room, now, `${next.name} is now the host.`);
      }
    }
    // A running game keeps going: the server plays the departed seat.
  }

  buildState(room: RoomDoc, playerId: PlayerId, now: number): StateResponse {
    const me = room.players.find((p) => p.id === playerId);
    const env = this.runnerEnv(room, now);
    const game = room.game ? getGame(room.game.gameId) : undefined;
    const inGame = new Set(room.game?.players ?? []);
    let gameSnap = null;
    let priv: unknown = null;
    if (room.game && game && room.phase !== "lobby") {
      const ctx = viewCtx(room.game, env);
      gameSnap = {
        gameId: room.game.gameId,
        players: room.game.players,
        publicState: game.publicView(room.game.state, ctx),
        pending: game.pending(room.game.state),
        deadline: game.deadline(room.game.state),
        wakeAt: nextWakeAt(game, room.game, env),
        roundSummaries: game.roundSummaries(room.game.state),
        startedAt: room.game.startedAt,
        config: room.game.config,
        over: game.isOver(room.game.state),
        autopilot: [...env.autopilot],
      };
      if (me && inGame.has(me.id)) priv = game.privateView(room.game.state, me.id, ctx);
    }
    return {
      room: {
        code: room.code,
        channel: channelFor(room.id),
        version: room.version,
        phase: room.phase,
        hostId: room.hostId,
        locked: room.locked,
        allowSpectators: room.allowSpectators,
        selectedGameId: room.selectedGameId,
        preset: room.preset,
        config: room.config,
        players: room.players.map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === room.hostId,
          isSpectator: p.isSpectator,
          ready: p.ready,
          connected: this.isConnected(p, now),
          inGame: inGame.has(p.id),
          points: p.points,
          wins: p.wins,
          gamesPlayed: p.gamesPlayed,
        })),
        game: gameSnap,
        lastResults: room.lastResults,
        history: room.history,
        log: room.log.slice(-15),
        expiresAt: room.activeAt + this.roomIdleMs,
        serverNow: now,
        formerNames: room.formerNames,
      },
      me: {
        playerId,
        isHost: room.hostId === playerId,
        isSpectator: me?.isSpectator ?? true,
        private: priv,
      },
    };
  }
}

export { GAMES };
