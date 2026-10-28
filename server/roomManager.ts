import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ROOM_CODE_LENGTH } from "../shared/constants";
import { GameError, Room, type Player, type RoomState } from "./room";
import { secureRandInt, type RandInt } from "./util";

export interface RoomManagerOptions {
  maxPlayersCap?: number;
  maxRooms?: number;
  /** ملف حفظ الغرف لاستعادتها بعد إعادة تشغيل الخادم. null لتعطيله */
  persistFile?: string | null;
  /** تُحذف الغرفة إذا ما فيها أحد متصل طوال هذه المدة */
  idleMs?: number;
  rand?: RandInt;
  now?: () => number;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  onRoomChange: ((room: Room) => void) | null = null;
  onRoomDeleted: ((code: string) => void) | null = null;

  private readonly maxPlayersCap: number | undefined;
  private readonly maxRooms: number;
  private readonly persistFile: string | null;
  private readonly idleMs: number;
  private readonly rand: RandInt;
  private readonly now: () => number;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(opts: RoomManagerOptions = {}) {
    this.maxPlayersCap = opts.maxPlayersCap;
    this.maxRooms = opts.maxRooms ?? 5000;
    this.persistFile = opts.persistFile ?? null;
    this.idleMs = opts.idleMs ?? 3 * 60 * 60 * 1000;
    this.rand = opts.rand ?? secureRandInt;
    this.now = opts.now ?? Date.now;
    this.load();
  }

  get size() {
    return this.rooms.size;
  }

  get(code: unknown): Room | undefined {
    return typeof code === "string" ? this.rooms.get(code) : undefined;
  }

  private roomOptions() {
    return { maxPlayersCap: this.maxPlayersCap, rand: this.rand, now: this.now };
  }

  private generateCode(): string {
    const min = 10 ** (ROOM_CODE_LENGTH - 1);
    for (let i = 0; i < 1000; i++) {
      const code = String(min + this.rand(9 * min));
      if (!this.rooms.has(code)) return code;
    }
    throw new GameError("server-busy");
  }

  private wire(room: Room) {
    room.onChange = () => {
      this.onRoomChange?.(room);
      this.scheduleSave();
    };
  }

  create(name: unknown, avatar: unknown): { room: Room; player: Player } {
    if (this.rooms.size >= this.maxRooms) throw new GameError("server-busy");
    const room = Room.create(this.generateCode(), this.roomOptions());
    const player = room.addPlayer(name, avatar);
    this.rooms.set(room.code, room);
    this.wire(room);
    this.scheduleSave();
    return { room, player };
  }

  delete(code: string) {
    if (this.rooms.delete(code)) {
      this.onRoomDeleted?.(code);
      this.scheduleSave();
    }
  }

  /** مؤقتات المراحل والغياب لكل الغرف */
  tick() {
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (err) {
        console.error(`[rooms] tick failed for ${room.code}:`, err);
      }
    }
  }

  /** حذف الغرف الفارغة أو المهجورة */
  sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const s = room.state;
      if (s.players.length === 0) {
        this.delete(room.code);
        continue;
      }
      const lastActivity = Math.max(s.updatedAt, ...s.players.map((p) => p.lastSeen));
      if (room.connectedCount() === 0 && now - lastActivity > this.idleMs) this.delete(room.code);
    }
  }

  // ---------- الحفظ والاستعادة ----------

  private load() {
    if (!this.persistFile || !existsSync(this.persistFile)) return;
    try {
      const data = JSON.parse(readFileSync(this.persistFile, "utf8")) as { rooms?: RoomState[] };
      const now = this.now();
      for (const state of data.rooms ?? []) {
        // بعد إعادة التشغيل لا أحد متصل حتى يعود ويستأنف جلسته
        for (const p of state.players) {
          p.connected = false;
          p.offlineSince = now;
        }
        state.hostOfflineSince = now;
        // نمدد المهلة الجارية حتى يرجع اللاعبون
        if (state.deadline !== null) state.deadline = Math.max(state.deadline, now + 15_000);
        const room = new Room(state, this.roomOptions());
        this.rooms.set(state.code, room);
        this.wire(room);
      }
      if (this.rooms.size) console.log(`[rooms] restored ${this.rooms.size} room(s) from ${this.persistFile}`);
    } catch (err) {
      console.error("[rooms] failed to restore rooms:", err);
    }
  }

  private scheduleSave() {
    if (!this.persistFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 1500);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (!this.persistFile) return;
    try {
      mkdirSync(dirname(this.persistFile), { recursive: true });
      const tmp = `${this.persistFile}.tmp`;
      writeFileSync(tmp, JSON.stringify({ savedAt: this.now(), rooms: [...this.rooms.values()].map((r) => r.state) }));
      renameSync(tmp, this.persistFile);
    } catch (err) {
      console.error("[rooms] failed to save rooms:", err);
    }
  }
}
