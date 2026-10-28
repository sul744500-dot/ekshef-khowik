import { describe, expect, it } from "vitest";
import { AVATARS, POINTS, TIMING } from "../shared/constants";
import { QUESTION_BANK } from "../shared/questions";
import type { RoomView, Settings } from "../shared/types";
import { GameError, Room, type Player } from "../server/room";

function seeded(seed = 7) {
  let s = seed;
  return (max: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % max;
  };
}

function setup(n = 5, settings: Partial<Settings> = {}, seed = 7) {
  let t = 1_000_000;
  const clock = {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
  const room = Room.create("12345", { rand: seeded(seed), now: clock.now });
  const players: Player[] = [];
  for (let i = 0; i < n; i++) {
    const p = room.addPlayer(`لاعب${i + 1}`, AVATARS[i]);
    room.setConnected(p.id, true);
    players.push(p);
  }
  const host = players[0];
  if (Object.keys(settings).length) room.dispatch(host.id, { type: "settings", patch: settings });
  const act = (id: string, payload: Record<string, unknown>) => room.dispatch(id, payload);
  const tickAfter = (ms: number) => {
    clock.advance(ms);
    room.tick();
  };
  return { room, players, host, clock, act, tickAfter };
}

type Ctx = ReturnType<typeof setup>;

const round = (room: Room) => room.state.round!;
const investigatorId = (room: Room) => round(room).investigator.id;
const targetId = (room: Room) => round(room).target!.id;
const others = (ctx: Ctx) => ctx.players.filter((p) => p.id !== investigatorId(ctx.room) && ctx.room.player(p.id));

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected error ${code}`);
}

/** يبدأ مباراة ويوصل لمرحلة الإجابات */
function toAnswering(ctx: Ctx, question = "لو جاك مليون ريال، وش أول شيء بتشتريه؟") {
  if (ctx.room.state.phase === "lobby") ctx.act(ctx.host.id, { type: "start" });
  expect(ctx.room.state.phase).toBe("announce");
  ctx.tickAfter(TIMING.announceMs + 1);
  expect(ctx.room.state.phase).toBe("question");
  ctx.act(investigatorId(ctx.room), { type: "question", text: question });
  expect(ctx.room.state.phase).toBe("answering");
}

function answerAll(ctx: Ctx) {
  for (const p of others(ctx)) ctx.act(p.id, { type: "answer", text: `إجابة ${p.name}` });
}

function cardOf(room: Room, authorId: string) {
  return round(room).cards!.find((c) => c.author.id === authorId)!;
}

/** يستبعد كل البطاقات ما عدا بطاقة صاحبها keepId */
function eliminateAllBut(ctx: Ctx, keepId: string) {
  const inv = investigatorId(ctx.room);
  for (const c of round(ctx.room).cards!) {
    if (c.author.id !== keepId && !c.out) ctx.act(inv, { type: "eliminate", cardId: c.id });
  }
}

function revealNow(ctx: Ctx) {
  ctx.act(investigatorId(ctx.room), { type: "reveal" });
  expect(ctx.room.state.phase).toBe("countdown");
  ctx.tickAfter(TIMING.countdownMs + 1);
  expect(ctx.room.state.phase).toBe("reveal");
}

/** هل يحتوي الكائن على معرّف لاعب أو اسمه في أي مكان؟ */
function mentions(value: unknown, needles: string[]): boolean {
  const json = JSON.stringify(value);
  return needles.some((n) => json.includes(n));
}

describe("بدء اللعب", () => {
  it("يحتاج 3 لاعبين متصلين على الأقل، وصاحب الغرفة فقط يبدأ", () => {
    const ctx = setup(2);
    expectError(() => ctx.act(ctx.host.id, { type: "start" }), "not-enough-players");
    const p3 = ctx.room.addPlayer("ثالث", AVATARS[5]);
    ctx.room.setConnected(p3.id, true);
    expectError(() => ctx.act(p3.id, { type: "start" }), "not-host");
    ctx.act(ctx.host.id, { type: "start" });
    expect(ctx.room.state.phase).toBe("announce");
  });

  it("المحقق لا يكون هو الشخص المطلوب، والاثنان معروفان للجميع", () => {
    const ctx = setup(5);
    ctx.act(ctx.host.id, { type: "start" });
    const r = round(ctx.room);
    expect(r.target).not.toBeNull();
    expect(r.target!.id).not.toBe(r.investigator.id);
    const view = ctx.room.buildView(ctx.players[3].id);
    expect(view.round!.investigator.id).toBe(r.investigator.id);
    expect(view.round!.target!.id).toBe(r.target!.id);
  });

  it("يرفض الأسماء المكررة ويحوّل الأسماء الفارغة لخطأ", () => {
    const ctx = setup(3);
    expectError(() => ctx.room.addPlayer("لاعب1", AVATARS[0]), "name-taken");
    expectError(() => ctx.room.addPlayer("   ", AVATARS[0]), "name-required");
  });
});

describe("جولة كاملة", () => {
  it("المحقق يبقي إجابة الشخص المطلوب للنهاية فيفوز بـ 100", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    answerAll(ctx);
    expect(ctx.room.state.phase).toBe("investigation");
    expect(round(ctx.room).cards).toHaveLength(4);
    const tgt = targetId(ctx.room);
    const inv = investigatorId(ctx.room);
    eliminateAllBut(ctx, tgt);
    revealNow(ctx);
    const view = ctx.room.buildView(inv);
    expect(view.round!.reveal!.investigatorWon).toBe(true);
    expect(ctx.room.player(inv)!.score).toBe(POINTS.found);
    expect(ctx.room.player(tgt)!.score).toBe(0);
    expect(ctx.room.player(inv)!.stats.found).toBe(1);
  });

  it("إذا استبعد إجابة المطلوب يكمل بدون أي تنبيه، وبعد الكشف يأخذ المطلوب 100 وصاحب الأخيرة 50", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    answerAll(ctx);
    const inv = investigatorId(ctx.room);
    const tgt = targetId(ctx.room);
    const before = ctx.room.buildView(inv);
    // أول استبعاد هو بطاقة الشخص المطلوب نفسه
    ctx.act(inv, { type: "eliminate", cardId: cardOf(ctx.room, tgt).id });
    const after = ctx.room.buildView(inv);
    expect(after.phase).toBe("investigation");
    expect(after.round!.reveal).toBeNull();
    expect(after.round!.remaining).toBe(3);
    // نفس شكل البيانات بالضبط: لا حقل جديد يلمّح أن القرار كان خاطئًا
    expect(Object.keys(after.round!.cards![0]).sort()).toEqual(Object.keys(before.round!.cards![0]).sort());
    const decoy = others(ctx).find((p) => p.id !== tgt)!;
    eliminateAllBut(ctx, decoy.id);
    revealNow(ctx);
    const reveal = ctx.room.buildView(inv).round!.reveal!;
    expect(reveal.investigatorWon).toBe(false);
    expect(reveal.cards.find((c) => c.id === reveal.targetCardId)!.author.id).toBe(tgt);
    expect(reveal.cards.find((c) => c.id === reveal.lastCardId)!.author.id).toBe(decoy.id);
    expect(ctx.room.player(tgt)!.score).toBe(POINTS.escaped);
    expect(ctx.room.player(decoy.id)!.score).toBe(POINTS.fooled);
    expect(ctx.room.player(inv)!.score).toBe(0);
    expect(ctx.room.player(decoy.id)!.stats.fooled).toBe(1);
    expect(ctx.room.player(tgt)!.stats.escaped).toBe(1);
  });

  it("بدون نظام نقاط: النتيجة والإحصائيات تُحسب والنقاط لا", () => {
    const ctx = setup(4, { scoring: false });
    toAnswering(ctx);
    answerAll(ctx);
    eliminateAllBut(ctx, targetId(ctx.room));
    revealNow(ctx);
    const inv = ctx.room.player(investigatorId(ctx.room))!;
    expect(inv.score).toBe(0);
    expect(inv.stats.found).toBe(1);
  });

  it("الجولات المتتالية بدون إعادة إنشاء الغرفة، والمحقق يتغير", () => {
    const ctx = setup(4);
    toAnswering(ctx);
    const first = investigatorId(ctx.room);
    answerAll(ctx);
    eliminateAllBut(ctx, targetId(ctx.room));
    revealNow(ctx);
    ctx.act(ctx.host.id, { type: "next" });
    expect(ctx.room.state.phase).toBe("announce");
    expect(investigatorId(ctx.room)).not.toBe(first);
    expect(round(ctx.room).no).toBe(2);
  });
});

describe("سرية الإجابات", () => {
  it("لا يصل صاحب أي بطاقة لأي جهاز قبل الكشف", () => {
    const ctx = setup(6);
    toAnswering(ctx);
    const ids = ctx.players.map((p) => p.id);
    const names = ctx.players.map((p) => p.name);
    const answerers = others(ctx);
    // أثناء الإجابة: كل لاعب يرى إجابته فقط
    ctx.act(answerers[0].id, { type: "answer", text: "سر-أول" });
    for (const p of ctx.players) {
      const json = JSON.stringify(ctx.room.buildView(p.id));
      expect(json.includes("سر-أول")).toBe(p.id === answerers[0].id);
    }
    for (const p of answerers.slice(1)) ctx.act(p.id, { type: "answer", text: `نص ${p.id.slice(0, 3)}` });
    expect(ctx.room.state.phase).toBe("investigation");

    const allowed = ["auto", "id", "mine", "n", "out", "outAt", "text"];
    const check = (view: RoomView, viewerId: string | null) => {
      expect(view.round!.reveal).toBeNull();
      for (const card of view.round!.cards!) {
        expect(Object.keys(card).sort()).toEqual(allowed);
        expect(mentions({ id: card.id, n: card.n }, ids)).toBe(false);
        if (card.mine) expect(viewerId).not.toBeNull();
      }
      expect(view.round!.cards!.filter((c) => c.mine).length).toBe(viewerId && answerers.some((a) => a.id === viewerId) ? 1 : 0);
      expect(mentions(view.round!.cards, [...ids, ...names])).toBe(false);
    };
    const inv = investigatorId(ctx.room);
    check(ctx.room.buildView(inv), inv);
    check(ctx.room.buildView(null), null);
    for (const p of answerers) check(ctx.room.buildView(p.id), p.id);

    // بعد كل استبعاد وأثناء العد التنازلي ما زالت الهويات مخفية
    const cards = round(ctx.room).cards!;
    for (const c of cards.slice(0, cards.length - 1)) {
      ctx.act(inv, { type: "eliminate", cardId: c.id });
      check(ctx.room.buildView(inv), inv);
    }
    ctx.act(inv, { type: "reveal" });
    check(ctx.room.buildView(inv), inv);
    check(ctx.room.buildView(null), null);
    ctx.tickAfter(TIMING.countdownMs + 1);
    expect(ctx.room.buildView(inv).round!.reveal!.cards.every((c) => ids.includes(c.author.id))).toBe(true);
  });

  it("ترتيب البطاقات لا يتبع ترتيب الإرسال دائمًا ومعرفاتها عشوائية", () => {
    let sameOrder = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const ctx = setup(6, {}, seed);
      toAnswering(ctx);
      const order = others(ctx).map((p) => p.id);
      for (const id of order) ctx.act(id, { type: "answer", text: `ج-${id}` });
      const cardAuthors = round(ctx.room).cards!.map((c) => c.author.id);
      if (cardAuthors.join() === order.join()) sameOrder++;
      for (const c of round(ctx.room).cards!) expect(order.some((id) => c.id.includes(id))).toBe(false);
    }
    expect(sameOrder).toBeLessThan(3);
  });
});

describe("التحقق من الصلاحيات", () => {
  it("فقط المحقق يستبعد ويكشف، ولا يمكن استبعاد آخر بطاقة أو الكشف مبكرًا", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    answerAll(ctx);
    const inv = investigatorId(ctx.room);
    const someone = others(ctx)[0];
    const card = round(ctx.room).cards![0];
    expectError(() => ctx.act(someone.id, { type: "eliminate", cardId: card.id }), "not-investigator");
    expectError(() => ctx.act(ctx.host.id === inv ? someone.id : ctx.host.id, { type: "eliminate", cardId: card.id }), "not-investigator");
    expectError(() => ctx.act(inv, { type: "reveal" }), "need-one-card");
    expectError(() => ctx.act(inv, { type: "eliminate", cardId: "nope" }), "card-invalid");
    ctx.act(inv, { type: "eliminate", cardId: card.id });
    expectError(() => ctx.act(inv, { type: "eliminate", cardId: card.id }), "card-invalid");
    const live = round(ctx.room).cards!.filter((c) => !c.out);
    ctx.act(inv, { type: "eliminate", cardId: live[0].id });
    ctx.act(inv, { type: "eliminate", cardId: live[1].id });
    expectError(() => ctx.act(inv, { type: "eliminate", cardId: live[2].id }), "last-card");
    expectError(() => ctx.act(someone.id, { type: "reveal" }), "not-investigator");
  });

  it("إجابة واحدة لكل لاعب، والمحقق لا يجيب، ولا إجابات فارغة", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    const [a] = others(ctx);
    expectError(() => ctx.act(investigatorId(ctx.room), { type: "answer", text: "أنا المحقق" }), "not-allowed");
    expectError(() => ctx.act(a.id, { type: "answer", text: "   " }), "answer-empty");
    ctx.act(a.id, { type: "answer", text: "أول" });
    expectError(() => ctx.act(a.id, { type: "answer", text: "تعديل" }), "already-answered");
    expect(round(ctx.room).answers.filter((x) => x.author.id === a.id)).toHaveLength(1);
    expect(round(ctx.room).answers[0].text).toBe("أول");
  });

  it("فقط المحقق يكتب السؤال", () => {
    const ctx = setup(4);
    ctx.act(ctx.host.id, { type: "start" });
    ctx.tickAfter(TIMING.announceMs + 1);
    const other = others(ctx)[0];
    expectError(() => ctx.act(other.id, { type: "question", text: "سؤال؟" }), "not-investigator");
    expectError(() => ctx.act(investigatorId(ctx.room), { type: "question", text: "ا" }), "question-short");
  });

  it("الأوامر القديمة (مرحلة مختلفة) تُرفض بهدوء", () => {
    const ctx = setup(4);
    ctx.act(ctx.host.id, { type: "start" });
    expectError(() => ctx.act(ctx.host.id, { type: "next", expectPhase: "reveal" }), "stale");
  });

  it("الإعدادات لصاحب الغرفة فقط وبقيم صحيحة", () => {
    const ctx = setup(4);
    expectError(() => ctx.act(ctx.players[1].id, { type: "settings", patch: { scoring: false } }), "not-host");
    expectError(() => ctx.act(ctx.host.id, { type: "settings", patch: { answerTime: 17 } }), "invalid");
    expectError(() => ctx.act(ctx.host.id, { type: "settings", patch: { hacked: true } }), "invalid");
    expectError(() => ctx.act(ctx.host.id, { type: "settings", patch: { maxPlayers: 99 } }), "invalid");
    ctx.act(ctx.host.id, { type: "settings", patch: { roundMode: "fixed", roundCount: 7, language: "en" } });
    expect(ctx.room.state.settings.roundCount).toBe(7);
    expect(ctx.room.state.settings.language).toBe("en");
    ctx.act(ctx.host.id, { type: "settings", patch: { roundMode: "cycles" } });
    expect(ctx.room.state.settings.roundCount).toBe(3);
  });

  it("الطرد لصاحب الغرفة فقط، ولا يطرد نفسه", () => {
    const ctx = setup(4);
    expectError(() => ctx.act(ctx.players[1].id, { type: "kick", playerId: ctx.players[2].id }), "not-host");
    expectError(() => ctx.act(ctx.host.id, { type: "kick", playerId: ctx.host.id }), "cannot-kick-self");
    const res = ctx.act(ctx.host.id, { type: "kick", playerId: ctx.players[2].id });
    expect(res.kickedId).toBe(ctx.players[2].id);
    expect(ctx.room.player(ctx.players[2].id)).toBeUndefined();
  });
});

describe("المؤقتات", () => {
  it("انتهاء وقت السؤال يسحب سؤالًا جاهزًا", () => {
    const ctx = setup(4, { questionTime: 30 });
    ctx.act(ctx.host.id, { type: "start" });
    ctx.tickAfter(TIMING.announceMs + 1);
    expect(ctx.room.state.deadline).not.toBeNull();
    ctx.tickAfter(30_001);
    expect(ctx.room.state.phase).toBe("answering");
    expect(round(ctx.room).autoQuestion).toBe(true);
    expect(QUESTION_BANK.ar).toContain(round(ctx.room).question);
  });

  it("انتهاء وقت الإجابات يبدأ التحقيق بالموجود إذا جاوب المطلوب", () => {
    const ctx = setup(5, { answerTime: 60 });
    toAnswering(ctx);
    const tgt = targetId(ctx.room);
    ctx.act(tgt, { type: "answer", text: "إجابة المطلوب" });
    ctx.act(others(ctx).find((p) => p.id !== tgt)!.id, { type: "answer", text: "إجابة ثانية" });
    ctx.tickAfter(60_001);
    expect(ctx.room.state.phase).toBe("investigation");
    expect(round(ctx.room).cards).toHaveLength(2);
  });

  it("انتهاء وقت الإجابات بدون إجابة المطلوب يلغي الجولة", () => {
    const ctx = setup(5, { answerTime: 30 });
    toAnswering(ctx);
    const tgt = targetId(ctx.room);
    for (const p of others(ctx).filter((p) => p.id !== tgt)) ctx.act(p.id, { type: "answer", text: "x" });
    ctx.tickAfter(30_001);
    expect(ctx.room.state.phase).toBe("reveal");
    expect(round(ctx.room).voided).toBe("target-missing");
    // لا تنكشف أي إجابة من جولة ملغاة
    expect(ctx.room.buildView(null).round!.cards).toBeNull();
  });

  it("انتهاء مهلة القرار يستبعد بطاقة عشوائية ثم يكشف تلقائيًا", () => {
    const ctx = setup(4, { decisionTime: 10 });
    toAnswering(ctx);
    answerAll(ctx);
    ctx.tickAfter(10_001);
    expect(round(ctx.room).cards!.filter((c) => c.out)).toHaveLength(1);
    expect(round(ctx.room).cards!.find((c) => c.out)!.auto).toBe(true);
    ctx.tickAfter(10_001);
    expect(ctx.room.state.phase).toBe("investigation");
    ctx.tickAfter(10_001);
    expect(ctx.room.state.phase).toBe("countdown");
    ctx.tickAfter(TIMING.countdownMs + 1);
    expect(ctx.room.state.phase).toBe("reveal");
  });

  it("الجولة الملغاة تنتقل للتالية تلقائيًا", () => {
    const ctx = setup(4);
    toAnswering(ctx);
    ctx.act(ctx.host.id, { type: "cancelRound" });
    expect(round(ctx.room).voided).toBe("host-cancelled");
    ctx.tickAfter(TIMING.voidNextMs + 1);
    expect(ctx.room.state.phase).toBe("announce");
  });
});

describe("الأدوار والدورات", () => {
  it("كل لاعب يصير محققًا مرة في الدورة، ثم تنتهي المباراة بالألقاب", () => {
    const n = 5;
    const ctx = setup(n);
    const investigators: string[] = [];
    const targets: string[] = [];
    ctx.act(ctx.host.id, { type: "start" });
    for (let i = 0; i < n; i++) {
      investigators.push(investigatorId(ctx.room));
      targets.push(targetId(ctx.room));
      toAnswering(ctx);
      answerAll(ctx);
      // نصف الجولات يكشف المحقق، والنصف الآخر ينخدع
      const tgt = targetId(ctx.room);
      const keep = i % 2 === 0 ? tgt : others(ctx).find((p) => p.id !== tgt)!.id;
      eliminateAllBut(ctx, keep);
      revealNow(ctx);
      ctx.act(ctx.host.id, { type: "next" });
    }
    expect(new Set(investigators).size).toBe(n);
    expect(new Set(targets).size).toBe(n);
    expect(ctx.room.state.phase).toBe("final");
    const final = ctx.room.buildView(ctx.host.id).final!;
    expect(final.rounds).toBe(n);
    expect(final.standings).toHaveLength(n);
    expect(final.standings[0].score).toBeGreaterThanOrEqual(final.standings[1].score);
    expect(final.titles.map((t) => t.kind)).toEqual(expect.arrayContaining(["detective", "trickster"]));
    // إعادة اللعب بنفس المجموعة
    ctx.act(ctx.host.id, { type: "playAgain" });
    expect(ctx.room.state.phase).toBe("announce");
    expect(ctx.room.state.players.every((p) => p.score === 0)).toBe(true);
  });

  it("عدد جولات ثابت", () => {
    const ctx = setup(3, { roundMode: "fixed", roundCount: 2 });
    for (let i = 0; i < 2; i++) {
      toAnswering(ctx);
      answerAll(ctx);
      eliminateAllBut(ctx, targetId(ctx.room));
      revealNow(ctx);
      expect(ctx.room.buildView(null).match!.isLast).toBe(i === 1);
      ctx.act(ctx.host.id, { type: "next" });
    }
    expect(ctx.room.state.phase).toBe("final");
  });

  it("الاختيار اليدوي: المحقق أو صاحب الغرفة يختار، والبقية لا", () => {
    const ctx = setup(4, { targetMode: "manual" });
    ctx.act(ctx.host.id, { type: "start" });
    expect(ctx.room.state.phase).toBe("pick");
    const inv = investigatorId(ctx.room);
    const rest = others(ctx);
    const outsider = rest.find((p) => p.id !== ctx.host.id)!;
    expectError(() => ctx.act(outsider.id, { type: "pickTarget", playerId: rest[0].id }), "not-investigator");
    expectError(() => ctx.act(inv, { type: "pickTarget", playerId: inv }), "target-invalid");
    ctx.act(inv, { type: "pickTarget", playerId: outsider.id });
    expect(targetId(ctx.room)).toBe(outsider.id);
    expect(ctx.room.state.phase).toBe("announce");
  });
});

describe("الانقطاع والخروج", () => {
  it("لاعب غاب طويلًا أثناء الإجابات يتم تجاهله ويبدأ التحقيق", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    const tgt = targetId(ctx.room);
    const [afk, ...rest] = others(ctx).filter((p) => p.id !== tgt);
    ctx.room.setConnected(afk.id, false);
    ctx.act(tgt, { type: "answer", text: "ج" });
    for (const p of rest) ctx.act(p.id, { type: "answer", text: "ج" });
    expect(ctx.room.state.phase).toBe("answering");
    ctx.tickAfter(TIMING.answererGraceMs + 1);
    expect(ctx.room.state.phase).toBe("investigation");
    expect(round(ctx.room).cards).toHaveLength(1 + rest.length);
  });

  it("الشخص المطلوب يخرج قبل ما يجاوب: تُلغى الجولة", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    ctx.room.leave(targetId(ctx.room));
    expect(round(ctx.room).voided).toBe("target-left");
  });

  it("الشخص المطلوب يخرج قبل السؤال: يُختار غيره", () => {
    const ctx = setup(5);
    ctx.act(ctx.host.id, { type: "start" });
    const old = targetId(ctx.room);
    ctx.room.leave(old);
    expect(ctx.room.state.phase).toBe("announce");
    expect(targetId(ctx.room)).not.toBe(old);
  });

  it("المطلوب جاوب ثم خرج: بطاقته تبقى وتنكشف باسمه", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    const tgt = targetId(ctx.room);
    answerAll(ctx);
    ctx.room.leave(tgt);
    expect(ctx.room.state.phase).toBe("investigation");
    eliminateAllBut(ctx, tgt);
    revealNow(ctx);
    const reveal = ctx.room.buildView(null).round!.reveal!;
    expect(reveal.investigatorWon).toBe(true);
    expect(reveal.cards.find((c) => c.isTarget)!.author.id).toBe(tgt);
  });

  it("المحقق يخرج: تُلغى الجولة، والمحقق الغائب طويلًا كذلك", () => {
    const ctx = setup(5);
    toAnswering(ctx);
    answerAll(ctx);
    ctx.room.leave(investigatorId(ctx.room));
    expect(round(ctx.room).voided).toBe("investigator-left");

    const ctx2 = setup(5);
    toAnswering(ctx2);
    answerAll(ctx2);
    ctx2.room.setConnected(investigatorId(ctx2.room), false);
    ctx2.tickAfter(TIMING.investigatorGraceMs + 1);
    expect(round(ctx2.room).voided).toBe("investigator-away");
  });

  it("الانقطاع المؤقت لا يضيع شيئًا: يرجع اللاعب لنفس الدور", () => {
    const ctx = setup(4);
    toAnswering(ctx);
    const p = others(ctx)[0];
    ctx.act(p.id, { type: "answer", text: "قبل الانقطاع" });
    ctx.room.setConnected(p.id, false);
    ctx.tickAfter(5000);
    ctx.room.setConnected(p.id, true);
    expect(ctx.room.findByToken(p.token)!.id).toBe(p.id);
    expect(ctx.room.buildView(p.id).round!.myAnswer).toBe("قبل الانقطاع");
  });

  it("تنتقل إدارة الغرفة إذا غاب صاحبها", () => {
    const ctx = setup(4);
    ctx.room.setConnected(ctx.host.id, false);
    ctx.tickAfter(TIMING.hostGraceMs + 1);
    expect(ctx.room.state.hostId).toBe(ctx.players[1].id);
  });

  it("لاعب انضم أثناء الإجابات يقدر يجاوب", () => {
    const ctx = setup(4);
    toAnswering(ctx);
    const late = ctx.room.addPlayer("متأخر", AVATARS[9]);
    ctx.room.setConnected(late.id, true);
    ctx.act(late.id, { type: "answer", text: "وصلت" });
    answerAll(ctx);
    expect(round(ctx.room).cards!.some((c) => c.author.id === late.id)).toBe(true);
  });
});
