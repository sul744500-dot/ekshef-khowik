import { motion } from "motion/react";
import { useT } from "../lib/lang";
import { useGame } from "../phases/context";
import { useRevealHold } from "../phases/revealTiming";
import { Avatar } from "./Avatar";
import { cn } from "./ui";

/** لوحة الترتيب مع النقاط المكتسبة في آخر جولة */
export function Scoreboard({ gains = {}, big }: { gains?: Record<string, number>; big?: boolean }) {
  const { t } = useT();
  const { view, me } = useGame();
  const hold = useRevealHold();
  const scoring = view.settings.scoring;
  const score = (p: { id: string; score: number }) => p.score - (hold?.[p.id] ?? 0);
  const players = [...view.players].sort((a, b) => (scoring ? score(b) - score(a) : 0) || b.stats.found - a.stats.found || b.stats.fooled - a.stats.fooled);
  return (
    <ol className="space-y-1.5">
      {players.map((p, i) => (
        <motion.li
          layout
          key={p.id}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2",
            p.id === me?.id ? "bg-violet-500/15 ring-1 ring-violet-400/30" : "bg-white/[.04]",
            big && "py-3",
          )}
        >
          <span className={cn("w-6 text-center font-display text-white/50", big ? "text-2xl" : "text-lg", i === 0 && "text-amber-300")}>{i + 1}</span>
          <Avatar person={p} size={big ? "md" : "sm"} offline={!p.connected} />
          <div className="min-w-0 flex-1">
            <div className={cn("truncate font-semibold text-white/90", big && "text-lg")}>{p.name}</div>
            {!hold && (
              <div className="flex flex-wrap gap-x-2 text-[11px] text-white/45">
                <span>🕵️ {t.stats.found(p.stats.found, p.stats.investigated)}</span>
                {p.stats.fooled > 0 && <span>🎭 {t.stats.fooled(p.stats.fooled)}</span>}
                {p.stats.escaped > 0 && <span>🥷 {t.stats.escaped(p.stats.escaped)}</span>}
              </div>
            )}
          </div>
          {gains[p.id] ? (
            <motion.span
              initial={{ opacity: 0, scale: 0.5, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-sm font-bold text-emerald-300"
            >
              +{gains[p.id]}
            </motion.span>
          ) : null}
          {scoring && <span className={cn("min-w-10 text-end font-display text-amber-300 tabular-nums", big ? "text-3xl" : "text-2xl")}>{score(p)}</span>}
        </motion.li>
      ))}
    </ol>
  );
}
