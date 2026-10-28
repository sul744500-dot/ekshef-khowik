import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { AVATARS, TIMING } from "../shared/constants";
import type { ReactionEvent, RoomView } from "../shared/types";
import { RoomManager } from "../server/roomManager";
import { attachGame } from "../server/socket";

// اختبار تكامل حقيقي: خادم Socket.IO وعدة لاعبين متصلين عبر الشبكة المحلية

let url = "";
let skew = 0;
let manager: RoomManager;
let shutdown: () => void;

beforeAll(async () => {
  const http = createServer();
  const io = new Server(http);
  manager = new RoomManager({ persistFile: null, now: () => Date.now() + skew });
  const game = attachGame(io, manager, { tickMs: 40, burst: 200, perSecond: 100 });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  shutdown = () => {
    game.close();
    io.close();
    http.close();
  };
});

afterAll(() => shutdown?.());

class Bot {
  socket: ClientSocket;
  view: RoomView | null = null;
  payloads: { phase: string; json: string }[] = [];
  reactions: ReactionEvent[] = [];
  kicked = false;
  token = "";
  id = "";

  constructor(readonly name: string) {
    this.socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    this.listen();
  }

  listen() {
    this.socket.on("room:state", (v: RoomView) => {
      this.view = v;
      this.payloads.push({ phase: v.phase, json: JSON.stringify(v) });
    });
    this.socket.on("reaction", (e: ReactionEvent) => this.reactions.push(e));
    this.socket.on("room:kicked", () => {
      this.kicked = true;
    });
  }

  async ask<T = Record<string, unknown>>(event: string, payload: object = {}): Promise<{ ok: boolean; error?: string } & T> {
    return this.socket.timeout(4000).emitWithAck(event, payload);
  }

  act(action: object) {
    return this.ask("action", action);
  }

  async until(pred: (v: RoomView) => boolean, label = "condition") {
    const start = Date.now();
    while (!(this.view && pred(this.view))) {
      if (Date.now() - start > 6000) throw new Error(`${this.name}: timed out waiting for ${label} (phase=${this.view?.phase})`);
      await new Promise((r) => setTimeout(r, 15));
    }
    return this.view!;
  }

  close() {
    this.socket.close();
  }
}

const phaseIs = (phase: string) => (v: RoomView) => v.phase === phase;

describe("لعب جماعي عبر Socket.IO", () => {
  it("جولة كاملة بين 5 لاعبين مع حماية السرية والصلاحيات وإعادة الاتصال", async () => {
    const names = ["عبدالله", "نايف", "عبدالرحمن", "يزيد", "محمد"];
    const bots = names.map((n) => new Bot(n));
    const [host, ...guests] = bots;

    const created = await host.ask<{ code: string; token: string; playerId: string }>("room:create", { name: host.name, avatar: AVATARS[0] });
    expect(created.ok).toBe(true);
    const code = created.code;
    host.token = created.token;
    host.id = created.playerId;
    for (const [i, g] of guests.entries()) {
      const r = await g.ask<{ token: string; playerId: string }>("room:join", { code, name: g.name, avatar: AVATARS[i + 1] });
      expect(r.ok).toBe(true);
      g.token = r.token;
      g.id = r.playerId;
    }
    const dup = new Bot("مكرر");
    expect((await dup.ask("room:join", { code, name: "نايف" })).error).toBe("name-taken");
    dup.close();

    // شاشة البث
    const watcher = new Bot("بث");
    expect((await watcher.ask("room:watch", { code })).ok).toBe(true);
    await watcher.until((v) => v.players.length === 5, "5 players");
    expect(watcher.view!.me).toBeNull();

    // غير صاحب الغرفة لا يبدأ
    expect((await guests[0].act({ type: "start" })).error).toBe("not-host");
    expect((await host.act({ type: "start" })).ok).toBe(true);
    for (const b of bots) await b.until(phaseIs("announce"), "announce");

    const round0 = host.view!.round!;
    const byId = (id: string) => bots.find((b) => b.id === id)!;
    const investigator = byId(round0.investigator.id);
    const target = byId(round0.target!.id);
    const answerers = bots.filter((b) => b !== investigator);
    // الكل يعرف المحقق والشخص المطلوب
    for (const b of bots) expect(b.view!.round!.target!.id).toBe(target.id);

    skew += TIMING.announceMs + 50;
    await investigator.until(phaseIs("question"), "question");
    expect((await answerers[0].act({ type: "question", text: "سؤال مزور؟" })).error).toBe("not-investigator");
    const question = "لو جاك مليون ريال، وش أول شيء بتشتريه؟";
    expect((await investigator.act({ type: "question", text: question, expectPhase: "question" })).ok).toBe(true);
    for (const b of bots) await b.until(phaseIs("answering"), "answering");
    expect(watcher.view!.round!.question).toBe(question);

    const answers: Record<string, string> = {};
    for (const b of answerers) answers[b.id] = `إجابة سرية من ${b.name}`;
    expect((await investigator.act({ type: "answer", text: "أحاول أجاوب" })).error).toBe("not-allowed");
    expect((await answerers[0].act({ type: "answer", text: answers[answerers[0].id] })).ok).toBe(true);
    expect((await answerers[0].act({ type: "answer", text: "مرة ثانية" })).error).toBe("already-answered");
    await investigator.until((v) => v.round!.answeredIds.length === 1, "1 answered");

    // إعادة اتصال أثناء الإجابات: نفس اللاعب ونفس إجابته
    const reconnecting = answerers[1];
    reconnecting.close();
    reconnecting.socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    reconnecting.listen();
    const resumed = await reconnecting.ask<{ playerId: string }>("room:resume", { code, token: reconnecting.token });
    expect(resumed.ok).toBe(true);
    expect(resumed.playerId).toBe(reconnecting.id);

    for (const b of answerers.slice(1)) expect((await b.act({ type: "answer", text: answers[b.id] })).ok).toBe(true);
    for (const b of bots) await b.until(phaseIs("investigation"), "investigation");

    // لا أحد غير المحقق يستبعد
    const cards = investigator.view!.round!.cards!;
    expect(cards).toHaveLength(4);
    expect((await target.act({ type: "eliminate", cardId: cards[0].id })).error).toBe("not-investigator");

    // المحقق يستبعد بطاقة الشخص المطلوب أولًا (نعرفها من الخادم فقط لأغراض الاختبار)
    const room = manager.get(code)!;
    const serverCards = room.state.round!.cards!;
    const targetCard = serverCards.find((c) => c.author.id === target.id)!;
    expect((await investigator.act({ type: "eliminate", cardId: targetCard.id })).ok).toBe(true);
    await investigator.until((v) => v.round!.remaining === 3, "3 remaining");
    expect(investigator.view!.phase).toBe("investigation");
    const decoy = serverCards.find((c) => c.author.id !== target.id)!;
    for (const c of serverCards) {
      if (c.id === targetCard.id || c.id === decoy.id) continue;
      expect((await investigator.act({ type: "eliminate", cardId: c.id })).ok).toBe(true);
    }
    await investigator.until((v) => v.round!.remaining === 1, "1 remaining");
    expect((await target.act({ type: "reveal" })).error).toBe("not-investigator");
    expect((await investigator.act({ type: "reveal" })).ok).toBe(true);
    for (const b of bots) await b.until(phaseIs("countdown"), "countdown");
    skew += TIMING.countdownMs + 50;
    for (const b of [...bots, watcher]) await b.until(phaseIs("reveal"), "reveal");

    // فحص كل ما وصل لكل جهاز قبل الكشف: لا مؤلف ولا هوية لأي بطاقة
    for (const b of [...bots, watcher]) {
      const before = b.payloads.filter((p) => p.phase !== "reveal");
      expect(before.length).toBeGreaterThan(0);
      for (const p of before) {
        expect(p.json).not.toContain('"author"');
        expect(p.json).not.toContain('"isTarget"');
        expect(p.json).not.toContain('"reveal":{');
        // نصوص إجابات الآخرين لا تصل لأحد أثناء مرحلة الكتابة
        if (p.phase === "answering") {
          for (const [authorId, text] of Object.entries(answers)) {
            if (authorId !== b.id) expect(p.json).not.toContain(text);
          }
        }
      }
    }

    const reveal = investigator.view!.round!.reveal!;
    expect(reveal.investigatorWon).toBe(false);
    expect(reveal.cards.find((c) => c.isTarget)!.author.id).toBe(target.id);
    const scores = Object.fromEntries(investigator.view!.players.map((p) => [p.id, p.score]));
    expect(scores[target.id]).toBe(100);
    expect(scores[decoy.author.id]).toBe(50);
    expect(scores[investigator.id]).toBe(0);

    // ردود الفعل تصل للجميع
    guests[2].socket.emit("react", { emoji: "😂" });
    guests[2].socket.emit("react", { emoji: "<script>" });
    await new Promise((r) => setTimeout(r, 150));
    expect(host.reactions.map((r) => r.emoji)).toEqual(["😂"]);
    expect(watcher.reactions).toHaveLength(1);

    // الجولة التالية بمحقق جديد
    expect((await host.act({ type: "next" })).ok).toBe(true);
    await host.until((v) => v.match!.seq === 2, "round 2");
    expect(host.view!.round!.investigator.id).not.toBe(investigator.id);

    // الطرد
    const victim = guests.find((g) => g.id !== host.view!.round!.investigator.id && g.id !== host.view!.round!.target!.id)!;
    expect((await host.act({ type: "kick", playerId: victim.id })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(victim.kicked).toBe(true);
    await host.until((v) => v.players.length === 4, "4 players");
    expect((await victim.ask("room:resume", { code, token: victim.token })).ok).toBe(false);

    for (const b of [...bots, watcher]) b.close();
  });

  it("رمز غرفة خاطئ أو جلسة منتهية", async () => {
    const b = new Bot("زائر");
    expect((await b.ask("room:join", { code: "00000", name: "x" })).error).toBe("room-not-found");
    const created = await b.ask<{ code: string }>("room:create", { name: "زائر" });
    expect((await b.ask("room:resume", { code: created.code, token: "x".repeat(36) })).error).toBe("session-expired");
    // الأرقام العربية في رمز الغرفة تُقبل
    const arabicCode = created.code.replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)));
    const peek = await b.ask<{ exists: boolean }>("room:peek", { code: arabicCode });
    expect(peek.exists).toBe(true);
    b.close();
  });
});
