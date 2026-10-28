import type { Server, Socket } from "socket.io";
import { REACTIONS, normalizeRoomCode } from "../shared/constants";
import type { ErrorCode, ReactionEvent } from "../shared/types";
import { GameError, type Room } from "./room";
import type { RoomManager } from "./roomManager";
import { isPlainObject, randomId } from "./util";

interface SocketData {
  code?: string;
  playerId?: string | null;
}

interface GameSocket extends Socket {
  data: SocketData;
}

type Reply = (res: unknown) => void;

function makeLimiter(capacity: number, refillPerSec: number) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

function clientIp(socket: Socket): string {
  const fwd = socket.handshake.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || socket.handshake.address || "unknown";
}

const fail = (error: ErrorCode, quiet = false) => ({ ok: false, error, quiet });

export interface GameServerOptions {
  burst?: number;
  perSecond?: number;
  tickMs?: number;
}

/** يربط منطق اللعبة بخادم Socket.IO. كل قرار يُتحقق منه هنا وفي Room على الخادم فقط. */
export function attachGame(io: Server, manager: RoomManager, opts: GameServerOptions = {}) {
  const subscribers = new Map<string, Set<GameSocket>>();
  const playerSockets = new Map<string, GameSocket>();
  const pendingBroadcast = new Set<string>();
  const createLimiters = new Map<string, () => boolean>();

  const keyOf = (code: string, playerId: string) => `${code}:${playerId}`;

  // كل لاعب يستلم نسخته الخاصة من الحالة: لا أحد يستلم أصحاب البطاقات قبل الكشف
  const sendState = (room: Room, socket: GameSocket) => {
    socket.emit("room:state", room.buildView(socket.data.playerId ?? null));
  };

  // نجمع التغييرات المتتالية في نفس اللحظة في بث واحد
  manager.onRoomChange = (room) => {
    if (pendingBroadcast.has(room.code)) return;
    pendingBroadcast.add(room.code);
    queueMicrotask(() => {
      pendingBroadcast.delete(room.code);
      if (!manager.get(room.code)) return;
      for (const s of subscribers.get(room.code) ?? []) sendState(room, s);
    });
  };

  manager.onRoomDeleted = (code) => {
    for (const s of subscribers.get(code) ?? []) {
      s.emit("room:closed");
      s.data = {};
    }
    subscribers.delete(code);
    for (const key of [...playerSockets.keys()]) if (key.startsWith(`${code}:`)) playerSockets.delete(key);
  };

  function unbind(socket: GameSocket, markOffline: boolean) {
    const { code, playerId } = socket.data;
    if (!code) return;
    subscribers.get(code)?.delete(socket);
    if (playerId) {
      const key = keyOf(code, playerId);
      if (playerSockets.get(key) === socket) {
        playerSockets.delete(key);
        if (markOffline) manager.get(code)?.setConnected(playerId, false);
      }
    }
    socket.data = {};
  }

  function bind(socket: GameSocket, room: Room, playerId: string | null) {
    unbind(socket, true);
    socket.data = { code: room.code, playerId };
    let subs = subscribers.get(room.code);
    if (!subs) subscribers.set(room.code, (subs = new Set()));
    subs.add(socket);
    if (playerId) {
      const key = keyOf(room.code, playerId);
      const old = playerSockets.get(key);
      if (old && old !== socket) {
        // نفس اللاعب فتح اللعبة من تبويب أو جهاز ثاني: الجديد يكمل والقديم يتوقف
        old.emit("room:replaced");
        subs.delete(old);
        old.data = {};
      }
      playerSockets.set(key, socket);
      room.setConnected(playerId, true);
    }
    sendState(room, socket);
  }

  function deleteIfEmpty(room: Room) {
    if (room.state.players.length === 0) manager.delete(room.code);
  }

  const findRoom = (p: Record<string, unknown>) => manager.get(normalizeRoomCode(String(p.code ?? "")));

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as unknown as GameSocket;
    socket.data = {};
    const limiter = makeLimiter(opts.burst ?? 30, opts.perSecond ?? 6);
    const reactionLimiter = makeLimiter(6, 2.5);
    const ip = clientIp(socket);

    const on = (event: string, fn: (payload: Record<string, unknown>, reply: Reply) => void) => {
      socket.on(event, (payload: unknown, ack: unknown) => {
        const reply: Reply = typeof ack === "function" ? (ack as Reply) : () => {};
        if (!limiter()) return reply(fail("rate-limited", true));
        try {
          fn(isPlainObject(payload) ? payload : {}, reply);
        } catch (err) {
          if (err instanceof GameError) reply(fail(err.code, err.quiet));
          else {
            console.error(`[socket] ${event} failed:`, err);
            reply(fail("unknown"));
          }
        }
      });
    };

    on("room:create", (p, reply) => {
      let lim = createLimiters.get(ip);
      if (!lim) createLimiters.set(ip, (lim = makeLimiter(8, 0.1)));
      if (!lim()) return reply(fail("too-many-rooms"));
      const { room, player } = manager.create(p.name, p.avatar);
      bind(socket, room, player.id);
      reply({ ok: true, code: room.code, token: player.token, playerId: player.id });
    });

    on("room:join", (p, reply) => {
      const room = findRoom(p);
      if (!room) return reply(fail("room-not-found"));
      const player = room.addPlayer(p.name, p.avatar);
      bind(socket, room, player.id);
      reply({ ok: true, code: room.code, token: player.token, playerId: player.id });
    });

    on("room:resume", (p, reply) => {
      const room = findRoom(p);
      if (!room) return reply(fail("room-not-found", true));
      const player = room.findByToken(p.token);
      if (!player) return reply(fail("session-expired", true));
      bind(socket, room, player.id);
      reply({ ok: true, code: room.code, token: player.token, playerId: player.id });
    });

    on("room:peek", (p, reply) => {
      const room = findRoom(p);
      if (!room) return reply({ ok: true, exists: false });
      const s = room.state;
      const player = room.findByToken(p.token);
      reply({
        ok: true,
        exists: true,
        phase: s.phase,
        locked: s.settings.locked,
        full: s.players.length >= s.settings.maxPlayers,
        language: s.settings.language,
        players: s.players.length,
        resumable: player ? { name: player.name, avatar: player.avatar } : null,
      });
    });

    // شاشة البث: تستلم الحالة العامة فقط بدون أي سر
    on("room:watch", (p, reply) => {
      const room = findRoom(p);
      if (!room) return reply(fail("room-not-found"));
      bind(socket, room, null);
      reply({ ok: true });
    });

    on("room:leave", (_p, reply) => {
      const { code, playerId } = socket.data;
      const room = manager.get(code);
      unbind(socket, false);
      if (room && playerId) {
        room.leave(playerId);
        deleteIfEmpty(room);
      }
      reply({ ok: true });
    });

    on("action", (p, reply) => {
      const { code, playerId } = socket.data;
      const room = manager.get(code);
      if (!room || !playerId) return reply(fail("no-connection"));
      const result = room.dispatch(playerId, p);
      if (result.kickedId) {
        const kicked = playerSockets.get(keyOf(room.code, result.kickedId));
        if (kicked) {
          unbind(kicked, false);
          kicked.emit("room:kicked");
        }
        deleteIfEmpty(room);
      }
      reply({ ok: true });
    });

    // ردود فعل لحظية: لا تُحفظ في الحالة، تُبث فقط لمن في الغرفة
    socket.on("react", (payload: unknown) => {
      const { code, playerId } = socket.data;
      if (!code || !playerId || !isPlainObject(payload)) return;
      const emoji = payload.emoji;
      if (typeof emoji !== "string" || !(REACTIONS as readonly string[]).includes(emoji)) return;
      if (!reactionLimiter()) return;
      const event: ReactionEvent = { id: randomId(4), playerId, emoji };
      for (const s of subscribers.get(code) ?? []) s.emit("reaction", event);
    });

    socket.on("disconnect", () => unbind(socket, true));
  });

  const ticker = setInterval(() => manager.tick(), opts.tickMs ?? 250);
  ticker.unref?.();
  const sweeper = setInterval(() => {
    manager.sweep();
    if (createLimiters.size > 5000) createLimiters.clear();
  }, 10_000);
  sweeper.unref?.();

  return {
    close() {
      clearInterval(ticker);
      clearInterval(sweeper);
    },
  };
}
