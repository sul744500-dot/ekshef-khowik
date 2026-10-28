import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../components/Avatar";
import { TimerBar } from "../components/TimerBar";
import { Button, cn } from "../components/ui";
import { useT } from "../lib/lang";
import { vibrate } from "../lib/haptics";
import { play } from "../lib/sound";
import { AnswerCard } from "./AnswerCard";
import { RoleChips } from "./common";
import { useGame } from "./context";

/** شبكة البطاقات حسب عددها */
export const gridCols = (n: number, big?: boolean) =>
  n <= 2 ? "sm:grid-cols-2" : n <= 4 ? "sm:grid-cols-2" : big ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";

export function InvestigationPhase({ big }: { big?: boolean }) {
  const { t } = useT();
  const { view, act, isInvestigator, watch, show, masked } = useGame();
  const r = view.round!;
  const cards = r.cards ?? [];
  const canAct = isInvestigator && !watch && view.phase === "investigation";
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // مؤثر الاستبعاد لكل من يشاهد، بدون أي معلومة عن صاحب البطاقة
  const seenOut = useRef(new Set(cards.filter((c) => c.out).map((c) => c.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const outIds = cards.filter((c) => c.out).map((c) => c.id);
    const newly = outIds.filter((id) => !seenOut.current.has(id));
    if (newly.length) {
      play("eliminate");
      vibrate(50);
      setFresh(new Set(newly));
      if (armed && newly.includes(armed)) setArmed(null);
    }
    seenOut.current = new Set(outIds);
  }, [cards, armed]);

  const dealt = useRef(false);
  const deal = !dealt.current && cards.every((c) => !c.out);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    if (cards.every((c) => !c.out)) play("deal");
  }, [cards]);

  // آخر بطاقة: نلفت الانتباه بصوت مرة وحدة
  const last = r.remaining === 1;
  useEffect(() => {
    if (last) play("question");
  }, [last]);

  const eliminate = async (cardId: string) => {
    setBusy(true);
    await act({ type: "eliminate", cardId });
    setBusy(false);
    setArmed(null);
  };

  const target = r.target!;
  return (
    <div className="space-y-5">
      {/* السؤال والمطلوب */}
      <div className="mx-auto max-w-4xl space-y-3 text-center">
        <p className={cn("font-bold leading-snug text-white/90 text-balance", big ? "text-3xl" : "text-lg sm:text-xl")}>❝ {r.question} ❞</p>
        {isInvestigator && !watch ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-auto flex w-fit items-center gap-3 rounded-full border border-rose-400/40 bg-rose-500/15 py-1.5 ps-1.5 pe-5 shadow-[0_0_40px_-12px_rgba(244,63,94,.7)]"
          >
            <Avatar person={target} size="md" />
            <div className="text-start">
              <div className="text-[11px] font-bold text-rose-200/80">🎯 {t.investigation.targetIs}</div>
              <div className="text-lg font-bold text-white">{t.investigation.findTarget(target.name)}</div>
            </div>
          </motion.div>
        ) : (
          <RoleChips />
        )}
      </div>

      {/* الحالة والمؤقت */}
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/[.08] px-3 py-1 font-display text-lg text-white tabular-nums">{t.investigation.remaining(r.remaining)}</span>
        </div>
        <p className="text-sm text-white/60">
          {canAct
            ? last
              ? t.investigation.lastOne
              : t.investigation.instruction
            : last
              ? t.investigation.watchingLast(show(r.investigator).name)
              : t.investigation.watching(show(r.investigator).name)}
        </p>
        <TimerBar className="w-full max-w-md" deadline={view.deadline} total={view.settings.decisionTime} audible={canAct} />
      </div>

      {/* البطاقات */}
      <div className={cn("grid grid-cols-1 gap-x-4 gap-y-6 pt-2", gridCols(cards.length, big))}>
        {cards.map((c, i) => (
          <AnswerCard
            key={c.id}
            card={c}
            index={i}
            deal={deal}
            big={big}
            interactive={canAct}
            armed={armed === c.id}
            busy={busy && armed === c.id}
            onArm={() => {
              play("arm");
              setArmed(c.id);
            }}
            onDisarm={() => setArmed(null)}
            onConfirm={() => void eliminate(c.id)}
            last={last && !c.out}
            fresh={fresh.has(c.id)}
            hideMine={masked}
          />
        ))}
      </div>

      {/* زر الكشف */}
      <AnimatePresence>
        {last && view.phase === "investigation" && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="sticky bottom-20 z-20 mx-auto max-w-md pt-2 text-center sm:bottom-24"
          >
            {canAct ? (
              <Button
                block
                size="xl"
                variant="gold"
                busy={busy}
                className="animate-glow-gold font-display !text-3xl"
                onClick={async () => {
                  setBusy(true);
                  await act({ type: "reveal" });
                  setBusy(false);
                }}
              >
                {t.investigation.reveal}
              </Button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
