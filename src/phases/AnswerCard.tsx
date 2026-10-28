import { AnimatePresence, motion } from "motion/react";
import type { CardView, PersonRef } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { Button, cn } from "../components/ui";
import { useT } from "../lib/lang";

export interface AnswerCardProps {
  card: CardView;
  index: number;
  /** المحقق يقدر يضغط عليها */
  interactive?: boolean;
  armed?: boolean;
  busy?: boolean;
  onArm?: () => void;
  onConfirm?: () => void;
  onDisarm?: () => void;
  /** آخر بطاقة باقية */
  last?: boolean;
  /** استُبعدت للتو: نشغّل حركة X */
  fresh?: boolean;
  hideMine?: boolean;
  big?: boolean;
  /** بعد الكشف */
  author?: PersonRef | null;
  isTarget?: boolean;
  deal?: boolean;
}

function XMark({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      {[
        "M12 14 L88 86",
        "M88 14 L12 86",
      ].map((d, i) => (
        <motion.path
          key={d}
          d={d}
          stroke="rgba(244,63,94,.8)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          fill="none"
          style={{ filter: "drop-shadow(0 0 6px rgba(244,63,94,.85))" }}
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.28, delay: i * 0.16, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

export function AnswerCard({
  card,
  index,
  interactive,
  armed,
  busy,
  onArm,
  onConfirm,
  onDisarm,
  last,
  fresh,
  hideMine,
  big,
  author,
  isTarget,
  deal,
}: AnswerCardProps) {
  const { t } = useT();
  const out = card.out;
  const clickable = interactive && !out && !last;
  return (
    <motion.div
      layout="position"
      initial={deal ? { opacity: 0, y: 60, rotate: index % 2 ? 8 : -8, scale: 0.7 } : false}
      animate={{
        opacity: 1,
        y: 0,
        rotate: 0,
        scale: out ? 0.97 : last ? 1.03 : 1,
        x: fresh ? [0, -10, 9, -6, 4, 0] : 0,
      }}
      transition={{ type: "spring", damping: 18, stiffness: 200, delay: deal ? index * 0.08 : 0, x: { duration: 0.45 } }}
      className="relative"
    >
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? (armed ? onDisarm : onArm) : undefined}
        onKeyDown={(e) => clickable && (e.key === "Enter" || e.key === " ") && (armed ? onDisarm?.() : onArm?.())}
        className={cn(
          "answer-card relative flex h-full flex-col rounded-3xl p-5 pt-7 transition-[filter,opacity,box-shadow] duration-500",
          big && "p-6 pt-8",
          out && "answer-card-out",
          clickable && "cursor-pointer hover:-translate-y-0.5 hover:border-violet-300/40",
          armed && "!border-rose-400/70 shadow-[0_0_0_2px_rgba(244,63,94,.45),0_20px_50px_-15px_rgba(244,63,94,.6)]",
          last && !author && "last-card",
          author && isTarget && "!border-emerald-400/60 shadow-[0_0_0_2px_rgba(52,211,153,.4),0_20px_50px_-15px_rgba(52,211,153,.55)]",
          author && !isTarget && !out && "!border-rose-400/50",
        )}
      >
        <span
          className={cn(
            "absolute -top-3.5 start-4 grid size-9 place-items-center rounded-xl font-display text-xl text-white shadow-lg",
            out ? "bg-slate-600/80 text-white/60" : "bg-linear-to-br from-violet-500 to-sky-500",
            big && "size-11 text-2xl",
          )}
        >
          {card.n}
        </span>
        {card.mine && !hideMine && (
          <span className="absolute -top-3 end-4 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-bold text-night-950 shadow">{t.investigation.yours}</span>
        )}
        {/* البطاقة المستبعدة تبقى مقروءة لكن باهتة، وعلامة X وصاحبها بعد الكشف بألوانهم الكاملة */}
        <p className={cn("flex-1 font-semibold leading-relaxed text-pretty", big ? "text-2xl" : "text-lg", out ? "text-white/40" : "text-white")}>{card.text}</p>

        {out && <XMark animate={!!fresh} />}
        {out && (
          <span className="mt-3 self-start rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
            ✖ {t.investigation.eliminated}
            {card.outAt ? ` #${card.outAt}` : ""}
            {card.auto ? ` • ${t.investigation.autoOut}` : ""}
          </span>
        )}

        <AnimatePresence>
          {armed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2 pt-4">
                <Button variant="danger" block busy={busy} onClick={onConfirm} silent>
                  ✖ {t.investigation.eliminate}
                </Button>
                <Button variant="ghost" onClick={onDisarm}>
                  {t.common.cancel}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {author && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", damping: 14, stiffness: 260 }}
              className={cn(
                "mt-4 flex items-center gap-2.5 rounded-2xl px-3 py-2",
                isTarget ? "bg-emerald-500/20" : "bg-white/[.07]",
              )}
            >
              <Avatar person={author} size={big ? "md" : "sm"} />
              <span className={cn("truncate font-bold text-white", big ? "text-xl" : "text-base")}>{author.name}</span>
              {isTarget && <span className="ms-auto shrink-0 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-bold text-night-950">{t.reveal.targetBadge}</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
