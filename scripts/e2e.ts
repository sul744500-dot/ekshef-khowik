// اختبار شامل بمتصفح حقيقي: كل لاعب في نافذة مستقلة (جوال وكمبيوتر) + شاشة البث.
// السيناريو الأول (عربي، 5 لاعبين): جولتان كاملتان عبر الواجهة، الأولى ينخدع المحقق والثانية يكشف،
// مع إعادة تحميل صفحة لاعب أثناء الإجابات، والتأكد أن أي بيانات وصلت للمتصفح قبل الكشف لا تحتوي أصحاب البطاقات.
// السيناريو الثاني (إنجليزي، 3 لاعبين): اختيار يدوي للمطلوب، وضع البث، مؤقت الاستبعاد، وردود الفعل.
//
// يحتاج الخادم شغالًا (npm run dev) ومتصفح Chrome أو Edge على الجهاز:
//   npm run e2e                      الصور في e2e-shots/
//   E2E=full|alt  BASE_URL=http://localhost:3100  CHROME_PATH="..."  SHOTS=folder

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { io } from "socket.io-client";
import type { Phase, RoomView } from "../shared/types";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.SHOTS ?? "e2e-shots";
const ONLY = process.env.E2E;
const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => existsSync(p));

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const STREAM = { width: 1600, height: 900 };

interface Player {
  name: string;
  page: Page;
  frames: string[];
  errors: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let shotNo = 0;

async function shot(page: Page, label: string) {
  const file = join(OUT, `${String(++shotNo).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: file as `${string}.png` });
  console.log(`📸 ${file}`);
}

async function clickText(page: Page, text: string, selector = "button") {
  const handle = await page.waitForFunction(
    (sel, txt) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find(
        (e) => e.innerText.includes(txt) && !(e as HTMLButtonElement).disabled && e.getClientRects().length > 0,
      ),
    { timeout: 15000 },
    selector,
    text,
  );
  await (handle as unknown as { click(): Promise<void> }).click();
}

async function fill(page: Page, selector: string, text: string) {
  await page.locator(selector).fill(text);
}

async function open(browser: Browser, name: string, viewport: typeof DESKTOP | typeof MOBILE, url: string): Promise<Player> {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  const player: Player = { name, page, frames: [], errors: [] };
  page.on("pageerror", (e) => player.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && player.errors.push(m.text()));
  // نسجل كل ما يصل للمتصفح عبر WebSocket لفحص السرية
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketFrameReceived", (e) => player.frames.push(e.response.payloadData));
  await page.goto(url, { waitUntil: "networkidle2" });
  return player;
}

/** مراقب عام (نفس بيانات شاشة البث) لمعرفة المرحلة الحالية بدون أي سر */
function watchRoom(code: string) {
  let view: RoomView | null = null;
  const socket = io(BASE, { transports: ["websocket"] });
  socket.on("room:state", (v: RoomView) => (view = v));
  socket.on("connect", () => socket.emit("room:watch", { code }, () => {}));
  return {
    get view() {
      return view as RoomView | null;
    },
    async waitPhase(phase: Phase, extra: (v: RoomView) => boolean = () => true, ms = 25000) {
      const start = Date.now();
      while (!(view && (view as RoomView).phase === phase && extra(view))) {
        if (Date.now() - start > ms) throw new Error(`timeout waiting for ${phase} (now ${(view as RoomView | null)?.phase})`);
        await sleep(50);
      }
      return view as RoomView;
    },
    close: () => socket.close(),
  };
}

async function createRoom(host: Player): Promise<string> {
  await fill(host.page, "input[autocomplete=nickname]", host.name);
  await clickText(host.page, "أنشئ غرفة");
  await host.page.waitForFunction(() => /\/r\/\d{5}$/.test(location.pathname), { timeout: 10000 });
  return host.page.url().match(/\/r\/(\d{5})/)![1];
}

function assertNoLeaks(all: Player[]) {
  for (const p of all) {
    if (p.frames.some((f) => f.includes('"author"') || f.includes('"isTarget"'))) throw new Error(`❌ تسريب هوية لـ ${p.name} قبل الكشف`);
    if (!p.frames.some((f) => f.includes('"cards":[{'))) throw new Error(`لم تصل بطاقات لـ ${p.name}؟`);
  }
  console.log("🔒 لا أحد استلم أصحاب البطاقات قبل الكشف");
}

function reportErrors(all: Player[]) {
  const errors = all.flatMap((p) => p.errors.map((e) => `${p.name}: ${e}`));
  if (errors.length) console.warn("⚠️ أخطاء في المتصفح:\n" + errors.join("\n"));
  else console.log("✅ لا أخطاء في أي متصفح");
}

// ---------- السيناريو الأول: 5 لاعبين بالعربي ----------

async function fullScenario(browser: Browser) {
  const host = await open(browser, "عبدالله", DESKTOP, BASE);
  await shot(host.page, "home-desktop");
  const code = await createRoom(host);
  console.log(`🏠 الغرفة ${code}`);
  const room = watchRoom(code);

  const guests: Player[] = [];
  for (const [i, name] of ["نايف", "عبدالرحمن", "يزيد", "محمد"].entries()) {
    const p = await open(browser, name, i === 3 ? DESKTOP : MOBILE, `${BASE}/r/${code}`);
    if (i === 0) await shot(p.page, "join-mobile");
    await fill(p.page, "input[autocomplete=nickname]", name);
    await clickText(p.page, "ادخل اللعبة");
    guests.push(p);
  }
  const players = [host, ...guests];
  const stream = await open(browser, "بث", STREAM, `${BASE}/watch/${code}`);
  await room.waitPhase("lobby", (v) => v.players.filter((p) => p.connected).length === 5);
  await sleep(800);
  await shot(host.page, "lobby-host");
  await shot(guests[0].page, "lobby-mobile");
  await shot(stream.page, "lobby-stream");

  const byName = (n: string) => players.find((p) => p.name === n)!;

  // جولتان: الأولى ينخدع المحقق، الثانية يكشف
  for (const round of [1, 2]) {
    if (round === 1) await clickText(host.page, "يلا نبدأ");
    else await clickText(byName(room.view!.round!.investigator.name).page, "الجولة التالية");

    const announce = await room.waitPhase("announce");
    // فحص السرية يشمل كل ما يصل من بداية هذه الجولة (كشف الجولة السابقة مسموح)
    for (const p of [...players, stream]) p.frames.length = 0;
    const inv = byName(announce.round!.investigator.name);
    const target = byName(announce.round!.target!.name);
    const others = players.filter((p) => p !== inv);
    const plain = others.find((p) => p !== target && p.page.viewport()!.width < 500) ?? others.find((p) => p !== target)!;
    console.log(`🕵️ المحقق ${inv.name} — 🎯 المطلوب ${target.name}`);
    await sleep(round === 1 ? 2000 : 4200);
    await shot(plain.page, `r${round}-announce-mobile`);
    if (round === 1) await shot(stream.page, `r${round}-announce-stream`);

    await room.waitPhase("question");
    await sleep(600);
    await shot(inv.page, `r${round}-question-investigator`);
    if (round === 1) await shot(plain.page, `r${round}-question-waiting`);
    const question = round === 1 ? "لو جاك مليون ريال، وش أول شيء بتشتريه؟" : "وش أول شيء تسويه إذا صحيت من النوم؟";
    await fill(inv.page, "textarea", question);
    await clickText(inv.page, "أرسل السؤال");

    await room.waitPhase("answering");
    await sleep(700);
    const pool =
      round === 1
        ? ["بشتري هايلكس وأطلع أطعس", "بعطي أبوي وأمي نص المبلغ", "بحجز تذكرة لليابان", "بشتري مزرعة وأربي غنم"]
        : ["أشيك الجوال قبل لا أفتح عيوني", "أصلي وأشرب قهوة", "أرجع أنام عشر دقايق", "أدور الشاحن"];
    const answers = new Map<Player, string>();
    others.forEach((p, i) => answers.set(p, pool[i]));
    await shot(plain.page, `r${round}-answering-before`);
    for (const p of others) {
      await fill(p.page, "textarea", answers.get(p)!);
      await clickText(p.page, "أرسل الإجابة");
      await sleep(250);
      if (p === plain) {
        // انقطاع مؤقت: تحديث الصفحة بعد الإرسال يرجع لنفس الحالة
        await p.page.reload({ waitUntil: "networkidle2" });
        await p.page.waitForFunction(() => document.body.innerText.includes("وصلت إجابتك"), { timeout: 10000 });
        if (round === 1) await shot(p.page, `r${round}-answering-sent-after-reload`);
      }
    }

    await room.waitPhase("investigation");
    await sleep(1500);
    await shot(inv.page, `r${round}-investigation-start`);
    if (round === 1) await shot(plain.page, `r${round}-investigation-viewer`);

    // ترتيب الاستبعاد: الجولة الأولى يستبعد إجابة المطلوب ثاني واحدة ويبقي غيره، الثانية يبقي المطلوب
    const keep = round === 1 ? others.find((p) => p !== target)! : target;
    const rest = others.filter((p) => p !== keep && p !== target);
    const order = round === 1 ? [rest[0], target, ...rest.slice(1)] : others.filter((p) => p !== keep);
    for (const [i, p] of order.entries()) {
      const text = answers.get(p)!;
      const card = await inv.page.waitForFunction(
        (txt) => [...document.querySelectorAll<HTMLElement>("[role=button]")].find((e) => e.innerText.includes(txt)),
        { timeout: 10000 },
        text,
      );
      await (card as unknown as { click(): Promise<void> }).click();
      await sleep(400);
      if (i === 0 && round === 1) await shot(inv.page, `r${round}-investigation-armed`);
      await clickText(inv.page, "استبعد");
      await room.waitPhase("investigation", (v) => v.round!.remaining === others.length - 1 - i);
      await sleep(700);
      // استُبعدت بطاقة المطلوب: لا شيء في الواجهة يقول ذلك
      if (round === 1 && p === target) await shot(inv.page, `r${round}-after-target-eliminated`);
    }
    await shot(inv.page, `r${round}-last-card`);
    if (round === 1) await shot(stream.page, `r${round}-investigation-stream`);
    assertNoLeaks([...players, stream]);

    await clickText(inv.page, "اكشف الهويات");
    await room.waitPhase("countdown");
    await sleep(900);
    await shot(target.page, `r${round}-countdown`);
    await room.waitPhase("reveal");
    await sleep(1000);
    await shot(inv.page, `r${round}-reveal-shuffle`);
    if (round === 1) await shot(stream.page, `r${round}-reveal-stream-early`);
    await sleep(2200);
    await shot(inv.page, `r${round}-reveal-verdict`);
    await sleep(4500);
    await shot(inv.page, `r${round}-reveal-done`);
    await shot(target.page, `r${round}-reveal-target-mobile`);
    await shot(stream.page, `r${round}-reveal-stream`);
    const result = room.view!.round!.reveal!;
    console.log(result.investigatorWon ? "✅ المحقق كشفه" : "😈 المحقق انخدع", result.awards.map((a) => `${a.player.name} +${a.points}`).join("، "));
    if (result.investigatorWon !== (round === 2)) throw new Error("نتيجة غير متوقعة");
  }

  // إنهاء المباراة من قائمة صاحب الغرفة
  await host.page.click("button[aria-label=القائمة]");
  await sleep(500);
  await clickText(host.page, "إنهاء اللعبة");
  await sleep(500);
  await clickText(host.page, "تأكيد");
  await room.waitPhase("final");
  await sleep(3500);
  await shot(host.page, "final-host");
  await shot(guests[0].page, "final-mobile");
  await shot(stream.page, "final-stream");
  reportErrors([...players, stream]);
  room.close();
}

// ---------- السيناريو الثاني: 3 لاعبين بالإنجليزي مع الإعدادات ----------

async function altScenario(browser: Browser) {
  const host = await open(browser, "Abdullah", DESKTOP, BASE);
  const code = await createRoom(host);
  console.log(`🏠 room ${code}`);
  const room = watchRoom(code);
  const page = host.page;
  // صاحب الغرفة يغيّر الإعدادات من اللوبي
  await clickText(page, "English");
  await room.waitPhase("lobby", (v) => v.settings.language === "en");
  await clickText(page, "Manual");
  await page.click("button[aria-label='Streamer mode']");
  await clickText(page, "10s");
  await room.waitPhase("lobby", (v) => v.settings.targetMode === "manual" && v.settings.streamerMode && v.settings.decisionTime === 10);

  const guests: Player[] = [];
  for (const name of ["Naif", "Yazeed"]) {
    const p = await open(browser, name, MOBILE, `${BASE}/r/${code}`);
    await fill(p.page, "input[autocomplete=nickname]", name);
    await clickText(p.page, "Join the game");
    guests.push(p);
  }
  const players = [host, ...guests];
  const stream = await open(browser, "stream", STREAM, `${BASE}/watch/${code}`);
  await room.waitPhase("lobby", (v) => v.players.filter((p) => p.connected).length === 3);
  await sleep(600);
  await shot(page, "en-lobby-host");
  await clickText(page, "Let's go");

  // الاختيار اليدوي: صاحب الغرفة يقدر يختار حتى لو ما كان المحقق
  const pick = await room.waitPhase("pick");
  const inv = players.find((p) => p.name === pick.round!.investigator.name)!;
  const targetName = players.find((p) => p !== inv)!.name;
  await sleep(500);
  await shot(inv.page, "en-pick-investigator");
  await clickText(inv.page, targetName);
  await room.waitPhase("question", undefined, 15000);
  await fill(inv.page, "textarea", "What's the first thing you'd buy with a million dollars?");
  await clickText(inv.page, "Send question");
  await room.waitPhase("answering");
  const others = players.filter((p) => p !== inv);
  const texts = ["A pickup truck to go dune bashing", "Half of it goes to my parents"];
  for (const [i, p] of others.entries()) {
    await fill(p.page, "textarea", texts[i]);
    await clickText(p.page, "Send answer");
  }
  await room.waitPhase("investigation");
  await sleep(1200);
  // وضع البث: الأسماء مخفية عند غير المحقق، والمحقق يشوف اسم المطلوب
  const viewer = others.find((p) => p.name !== targetName) ?? others[0];
  const invText = await inv.page.evaluate(() => document.body.innerText);
  const viewerText = await viewer.page.evaluate(() => document.body.innerText);
  if (!invText.includes(targetName)) throw new Error("المحقق لازم يشوف اسم المطلوب في وضع البث");
  if (viewerText.includes(targetName) || viewerText.includes(inv.name)) throw new Error("وضع البث لازم يخفي الأسماء");
  await shot(inv.page, "en-investigation-investigator");
  await shot(stream.page, "en-investigation-stream-masked");
  // ردود فعل من الجوال
  await viewer.page.click("button[aria-label=Reactions]");
  await sleep(300);
  await clickText(viewer.page, "😂");
  await clickText(viewer.page, "🔥");
  await sleep(500);
  await shot(stream.page, "en-reactions-stream");
  await shot(viewer.page, "en-investigation-viewer-masked");
  // انتهاء مهلة القرار: استبعاد تلقائي ثم كشف تلقائي
  await room.waitPhase("investigation", (v) => v.round!.remaining === 1, 15000);
  await sleep(600);
  await shot(inv.page, "en-auto-eliminated");
  assertNoLeaks([...players, stream]);
  await room.waitPhase("reveal", undefined, 20000);
  await sleep(8000);
  await shot(inv.page, "en-reveal");
  await shot(stream.page, "en-reveal-stream");
  await page.click("button[aria-label=Menu]");
  await sleep(400);
  await clickText(page, "End game");
  await sleep(400);
  await clickText(page, "Confirm");
  await room.waitPhase("final");
  await sleep(3000);
  await shot(page, "en-final");
  reportErrors([...players, stream]);
  room.close();
}

async function main() {
  if (!CHROME) throw new Error("ما لقيت Chrome أو Edge، حدد المسار في CHROME_PATH");
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  try {
    if (!ONLY || ONLY === "full") await fullScenario(browser);
    if (!ONLY || ONLY === "alt") await altScenario(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
