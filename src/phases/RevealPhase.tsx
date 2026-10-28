import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AwardKind } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { Scoreboard } from "../components/Scoreboard";
import { Button, Panel, cn } from "../components/ui";
import { serverNow } from "../lib/clock";
import { burst, sideCannons } from "../lib/fx";
import { useT } from "../lib/lang";
import { vibrate } from "../lib/haptics";
import { play } from "../lib/sound";
import { AnswerCard } from "./AnswerCard";
import { useGame } from "./context";
import { gridCols } from "./InvestigationPhase";
import { REVEAL, revealDuration } from "./revealTiming";

const { land: LAND, verdict: VERDICT, outStart: OUT_START, outStep: OUT_STEP } = REVEAL;

const AWARD_STYLE: Record<AwardKind, string> = {
  found: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  escaped: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  fooled: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30",
};
const AWARD_ICON: Record<AwardKind, string> = { found: "🕵️", escaped: "🥷", fooled: "🎭" };

export function RevealPhase({ big }: { big?: boolean }) {
  const { t } = useT();
  const { view, act, isHost, isInvestigator, watch, me, hostName } = useGame();
  const r = view.round!;
  const rv = r.reveal!;
  const startedAgo = useRef(serverNow() - view.phaseStartedAt).current;
  // من فتح الصفحة بعد انتهاء المشهد يرى النتيجة مباشرة
  const late = startedAgo > revealDuration(rv) + 1500;
  const [ms, setMs] = useState(late ? 1e9 : Math.max(0, startedAgo));

  useEffect(() => {
    if (late) return;
    const t0 = performance.now() - ms;
    const id = setInterval(() => setMs(performance.now() - t0), 50);
    return () => clearInterval(id);
    // يبدأ مرة وحدة عند ظهور الكشف
  }, []);

  const lastCard = rv.cards.find((c) => c.id === rv.lastCardId)!;
  const targetCard = rv.cards.find((c) => c.id === rv.targetCardId)!;
  const outOrder = useMemo(() => [...rv.cards].filter((c) => c.out).sort((a, b) => (a.outAt ?? 0) - (b.outAt ?? 0)), [rv.cards]);
  const revealAt = (cardId: string) => {
    if (cardId === rv.lastCardId) return LAND;
    const i = outOrder.findIndex((c) => c.id === cardId);
    return OUT_START + i * OUT_STEP;
  };
  const done = revealDuration(rv);
  const landed = ms >= LAND;
  const verdict = ms >= VERDICT;
  const finished = ms >= done;
  const won = rv.investigatorWon;

  // الأصوات والاحتفالات حسب الخط الزمني (مرة وحدة لكل حدث)
  const fired = useRef(new Set<string>());
  const once = (key: string, fn: () => void) => {
    if (late || fired.current.has(key)) return;
    fired.current.add(key);
    fn();
  };
  const shuffleTick = Math.floor(ms / 90);
  useEffect(() => {
    if (!landed && !late) play("roll");
  }, [shuffleTick, landed, late]);
  useEffect(() => {
    if (landed) once("land", () => play("hit"));
    if (verdict)
      once("verdict", () => {
        play(won ? "win" : "lose");
        if (won) {
          burst(big ? 1.6 : 1.2);
          if (isInvestigator) sideCannons();
        }
        vibrate(won ? [60, 40, 60] : 200);
      });
    outOrder.forEach((c) => {
      if (ms >= revealAt(c.id)) once(c.id, () => play(c.isTarget ? "gasp" : "flip"));
    });
  });

  // صورة متغيرة سريعة قبل ما تقف على صاحب البطاقة الأخيرة
  const shufflePool = view.players.length ? view.players : [lastCard.author];
  const heroPerson = landed ? lastCard.author : shufflePool[shuffleTick % shufflePool.length];

  const gains: Record<string, number> = {};
  if (finished) for (const a of rv.awards) if (a.points) gains[a.player.id] = (gains[a.player.id] ?? 0) + a.points;

  const canNext = !watch && (isHost || isInvestigator);
  const investigator = r.investigator.name;
  const target = r.target!.name;

  return (
    <div className="space-y-6">
      {/* البطاقة الأخيرة */}
      <div className="mx-auto max-w-2xl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 14 }}
          className={cn(
            "hero-card relative overflow-hidden rounded-[2rem] p-6 text-center sm:p-8",
            verdict && (won ? "hero-won" : "hero-lost"),
          )}
        >
          <div className="text-sm font-bold text-white/60">{t.reveal.lastCard}</div>
          <p className={cn("mt-3 font-bold leading-snug text-white text-balance", big ? "text-4xl" : "text-2xl sm:text-3xl")}>❝ {lastCard.text} ❞</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <motion.div key={landed ? "landed" : "shuffle"} animate={landed ? { scale: [1.6, 1], rotate: [8, 0] } : undefined} transition={{ type: "spring", damping: 8 }}>
              <Avatar person={heroPerson} size={big ? "2xl" : "xl"} className={cn(!landed && "blur-[1px]")} />
            </motion.div>
            <div className={cn("font-display", big ? "text-6xl" : "text-4xl sm:text-5xl", landed ? "text-white" : "text-white/30")}>
              {landed ? lastCard.author.name : "؟؟؟"}
            </div>
            <AnimatePresence>
              {verdict && (
                <motion.div
                  initial={{ opacity: 0, scale: 2.5, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -6 }}
                  transition={{ type: "spring", damping: 10, stiffness: 200 }}
                  className={cn(
                    "rounded-2xl border-4 px-6 py-2 font-display text-5xl sm:text-6xl",
                    won ? "border-emerald-400 text-emerald-300 [text-shadow:0_0_30px_rgba(52,211,153,.7)]" : "border-rose-500 text-rose-400 [text-shadow:0_0_30px_rgba(244,63,94,.7)]",
                  )}
                >
                  {won ? t.reveal.won : t.reveal.lost}
                </motion.div>
              )}
            </AnimatePresence>
            {verdict && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-lg font-semibold text-white/85">
                {won ? t.reveal.wonLine(investigator, target) : t.reveal.lostLine(investigator, lastCard.author.name)}
              </motion.p>
            )}
            {verdict && !won && ms >= revealAt(targetCard.id) && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-rose-500/15 px-4 py-1.5 text-sm font-semibold text-rose-200">
                {targetCard.auto ? t.reveal.targetAuto(target, targetCard.n) : t.reveal.targetWas(target, targetCard.n, targetCard.outAt ?? 0)}
              </motion.p>
            )}
          </div>
        </motion.div>
      </div>

      {/* كل البطاقات بعد كشف أصحابها */}
      <div>
        <h3 className="mb-4 text-center font-display text-2xl text-white/80">{t.reveal.allCards}</h3>
        <div className={cn("grid grid-cols-1 gap-x-4 gap-y-6", gridCols(rv.cards.length, big))}>
          {rv.cards.map((c, i) => (
            <AnswerCard
              key={c.id}
              card={c}
              index={i}
              big={big}
              hideMine={view.settings.streamerMode}
              author={ms >= revealAt(c.id) ? c.author : null}
              isTarget={c.isTarget}
              last={c.id === rv.lastCardId}
            />
          ))}
        </div>
      </div>

      {/* النقاط والترتيب */}
      <AnimatePresence>
        {finished && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2">
            <Panel className="p-5">
              <div className="flex flex-col gap-2">
                {rv.awards.map((a, i) => (
                  <motion.div
                    key={`${a.kind}-${a.player.id}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: i * 0.15 } }}
                    className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5", AWARD_STYLE[a.kind])}
                  >
                    <span className="text-2xl">{AWARD_ICON[a.kind]}</span>
                    <Avatar person={a.player} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-white">{a.player.name}</div>
                      <div className="text-xs">{t.reveal[a.kind]}</div>
                    </div>
                    {view.settings.scoring && <span className="font-display text-3xl">+{a.points}</span>}
                  </motion.div>
                ))}
              </div>
            </Panel>
            <Panel className="p-5">
              <h3 className="mb-3 font-display text-xl text-white/85">🏆 {t.scoreboard.title}</h3>
              <Scoreboard gains={gains} />
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {finished && (
        <div className="sticky bottom-20 z-20 mx-auto max-w-md text-center sm:bottom-24">
          {canNext ? (
            <Button block size="xl" variant={view.match?.isLast ? "gold" : "primary"} onClick={() => void act({ type: "next" })}>
              {view.match?.isLast ? t.reveal.finalResults : `${t.reveal.next} ⏭️`}
            </Button>
          ) : (
            !watch && me && <div className="glass-strong rounded-full px-5 py-3 text-sm text-white/70">{t.reveal.waitingNext(hostName)}</div>
          )}
        </div>
      )}
    </div>
  );
}
