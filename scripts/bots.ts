// لاعبون افتراضيون حقيقيون: كل بوت يتصل بالخادم عبر Socket.IO كأنه جهاز مستقل ويلعب حسب دوره.
// الاستخدام:
//   npm run bots -- 12345            ينضم 4 بوتات للغرفة 12345
//   npm run bots -- 12345 6          ينضم 6 بوتات
//   npm run bots -- new 4            ينشئ غرفة جديدة ويبدأ اللعب تلقائيًا
// خيارات: --url http://localhost:3100   --fast (ردود أسرع)   --auto (البوت المحقق/المضيف يضغط "الجولة التالية")

import { io, type Socket } from "socket.io-client";
import { AVATARS, REACTIONS } from "../shared/constants";
import { QUESTION_BANK } from "../shared/questions";
import type { RoomView } from "../shared/types";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--url"));
const target = positional[0] ?? "new";
const count = Number(positional[1] ?? 4);
const url = option("url", "http://localhost:3100");
const fast = flag("fast");
const auto = flag("auto") || target === "new";

const NAMES = ["نايف", "عبدالرحمن", "يزيد", "محمد", "فهد", "سلمان", "تركي", "خالد", "ريان", "مشعل"];
const ANSWERS = [
  "بشتري هايلكس وأطلع أطعس",
  "بعطي أبوي وأمي نص المبلغ",
  "بحجز تذكرة لليابان",
  "بشتري مزرعة وأربي غنم",
  "أنام يومين كاملة",
  "كبسة لحم بدون نقاش",
  "أسوي نفسي مشغول وأطنش",
  "أفتح كافيه مختص",
  "بلايستيشن وبيتزا",
  "أروح البر مع الشباب",
  "أتصل على أمي أول شيء",
  "أشتري ساعة وأندم بعدها",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, fast ? ms / 4 : ms));
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

class Bot {
  socket: Socket;
  view: RoomView | null = null;
  id = "";
  busy = new Set<string>();

  constructor(readonly name: string) {
    this.socket = io(url, { transports: ["websocket"], forceNew: true });
    this.socket.on("room:state", (v: RoomView) => {
      this.view = v;
      void this.think();
    });
    this.socket.on("room:kicked", () => {
      console.log(`👋 ${this.name} انطرد`);
      this.socket.close();
    });
  }

  ask<T = Record<string, unknown>>(event: string, payload: object = {}): Promise<{ ok: boolean; error?: string } & T> {
    return this.socket.timeout(5000).emitWithAck(event, payload);
  }

  act(action: object) {
    const v = this.view;
    return this.ask("action", { ...action, expectPhase: v?.phase, expectSeq: v?.match?.seq ?? 0 });
  }

  /** ينفّذ مهمة مرة وحدة لكل مرحلة/جولة */
  private async once(key: string, fn: () => Promise<void>) {
    if (this.busy.has(key)) return;
    this.busy.add(key);
    await fn();
  }

  async think() {
    const v = this.view;
    if (!v?.round || !v.me) return;
    const r = v.round;
    const seq = v.match?.seq ?? 0;
    const meInv = r.investigator.id === this.id;
    switch (v.phase) {
      case "pick":
        if (meInv)
          await this.once(`pick-${seq}`, async () => {
            await sleep(2000);
            const options = v.players.filter((p) => p.id !== this.id && p.connected);
            const res = await this.act({ type: "pickTarget", playerId: pick(options).id });
            console.log(`🎯 ${this.name} اختار المطلوب`, res.ok ? "" : res.error);
          });
        break;
      case "question":
        if (meInv)
          await this.once(`q-${seq}`, async () => {
            await sleep(jitter(3000, 5000));
            const text = pick(QUESTION_BANK[v.settings.language]);
            const res = await this.act({ type: "question", text });
            console.log(`❓ ${this.name} سأل: ${text}`, res.ok ? "" : res.error);
          });
        break;
      case "answering":
        if (!meInv && r.myAnswer === null)
          await this.once(`a-${seq}`, async () => {
            await sleep(jitter(2000, 6000));
            const text = `${pick(ANSWERS)}${Math.random() < 0.3 ? " 😂" : ""}`;
            const res = await this.act({ type: "answer", text });
            console.log(`✍️ ${this.name} جاوب: ${text}`, res.ok ? "" : res.error);
          });
        break;
      case "investigation":
        if (meInv)
          await this.once(`inv-${seq}`, async () => {
            await sleep(2500);
            while (this.view?.phase === "investigation" && this.view.match?.seq === seq) {
              const cards = this.view.round!.cards!.filter((c) => !c.out);
              if (cards.length <= 1) {
                await sleep(1500);
                await this.act({ type: "reveal" });
                console.log(`🔥 ${this.name} كشف الهويات`);
                break;
              }
              const card = pick(cards);
              await this.act({ type: "eliminate", cardId: card.id });
              console.log(`✖ ${this.name} استبعد البطاقة ${card.n}`);
              await sleep(jitter(1500, 2600));
            }
          });
        else if (Math.random() < 0.15) this.socket.emit("react", { emoji: pick(REACTIONS) });
        break;
      case "reveal":
        if (Math.random() < 0.4) this.socket.emit("react", { emoji: pick(["😂", "😱", "💀", "👏"]) });
        if (auto && (meInv || v.me.isHost))
          await this.once(`next-${seq}`, async () => {
            await sleep(r.voided ? 1500 : 9000);
            if (this.view?.phase === "reveal" && this.view.match?.seq === seq) await this.act({ type: "next" });
          });
        break;
      case "final":
        await this.once(`final-${v.match?.no}`, async () => {
          const top = v.final?.standings[0];
          console.log(`🏆 انتهت اللعبة — البطل: ${top?.player.name} (${top?.score})`);
        });
        break;
    }
  }
}

async function main() {
  const bots: Bot[] = [];
  let code = target;
  const names = [...NAMES].sort(() => Math.random() - 0.5).slice(0, count);
  for (const [i, name] of names.entries()) {
    const bot = new Bot(name);
    await new Promise<void>((r) => bot.socket.once("connect", () => r()));
    const res =
      code === "new"
        ? await bot.ask<{ code: string; playerId: string }>("room:create", { name, avatar: AVATARS[i + 4] })
        : await bot.ask<{ code: string; playerId: string }>("room:join", { code, name, avatar: AVATARS[i + 4] });
    if (!res.ok) {
      console.error(`❌ ${name}: ${res.error}`);
      bot.socket.close();
      continue;
    }
    code = res.code;
    bot.id = res.playerId;
    bots.push(bot);
    console.log(`✅ ${name} دخل الغرفة ${code}`);
    await sleep(300);
  }
  if (target === "new" && bots[0]) {
    console.log(`🔗 ${url}/r/${code}`);
    await sleep(1500);
    const res = await bots[0].act({ type: "start" });
    console.log(res.ok ? "🚀 بدأت اللعبة" : `❌ ${res.error}`);
  }
  process.on("SIGINT", () => {
    for (const b of bots) b.socket.close();
    process.exit(0);
  });
}

void main();
