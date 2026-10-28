import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PersonRef } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { cn } from "../components/ui";
import { serverNow } from "../lib/clock";
import { useT } from "../lib/lang";
import { play } from "../lib/sound";
import { RoleHint } from "./common";
import { useGame } from "./context";

const ROLL_START = 1100;
const ROLL_END = 3300;

/** إعلان الجولة: المحقق، ثم روليت سريع يقف على الشخص المطلوب */
export function AnnouncePhase({ big }: { big?: boolean }) {
  const { t } = useT();
  const { view } = useGame();
  const r = view.round!;
  const target = r.target!;
  const manual = view.settings.targetMode === "manual";
  // من دخل متأخرًا يرى النتيجة مباشرة بدون روليت
  const startedAgo = useRef(serverNow() - view.phaseStartedAt);
  const skip = manual || startedAgo.current > ROLL_START + 600;
  const [elapsed, setElapsed] = useState(skip ? ROLL_END + 1000 : Math.max(0, startedAgo.current));

  const pool = useMemo<PersonRef[]>(() => {
    const others = view.players.filter((p) => p.id !== r.investigator.id);
    return others.length ? others : [target];
  }, [view.players, r.investigator.id, target]);

  useEffect(() => {
    if (skip) return;
    const t0 = performance.now() - elapsed;
    let raf = 0;
    const loop = () => {
      const e = performance.now() - t0;
      setElapsed(e);
      if (e < ROLL_END + 1200) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    play("whoosh");
    return () => cancelAnimationFrame(raf);
  }, []);

  // الروليت يتباطأ تدريجيًا حتى يقف
  const rolling = elapsed >= ROLL_START && elapsed < ROLL_END;
  const landed = elapsed >= ROLL_END;
  const progress = Math.min(1, Math.max(0, (elapsed - ROLL_START) / (ROLL_END - ROLL_START)));
  const step = Math.floor(28 * (1 - (1 - progress) ** 2.4));
  const shown = landed ? target : pool[step % pool.length];

  const lastStep = useRef(-1);
  useEffect(() => {
    if (rolling && step !== lastStep.current) {
      lastStep.current = step;
      play("roll");
    }
  }, [rolling, step]);
  const landedOnce = useRef(skip);
  useEffect(() => {
    if (landed && !landedOnce.current) {
      landedOnce.current = true;
      play("land");
    }
  }, [landed]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 2.2, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: [0.2, 1.4, 0.4, 1] }}
        className={cn("font-display text-gradient", big ? "text-8xl" : "text-6xl sm:text-7xl")}
      >
        {t.announce.roundLabel(r.no)}
      </motion.div>

      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.45, type: "spring", damping: 16 }}
          className="flex flex-col items-center gap-3 rounded-3xl border border-violet-400/30 bg-violet-500/10 p-4 sm:p-6"
        >
          <span className="text-sm font-bold text-violet-200">🕵️ {t.roles.investigator}</span>
          <Avatar person={r.investigator} size={big ? "2xl" : "xl"} />
          <span className={cn("w-full truncate font-bold text-white", big ? "text-3xl" : "text-xl")}>{r.investigator.name}</span>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-col items-center gap-1">
          <span className="text-4xl">🔍</span>
          <span className="max-w-16 text-xs font-semibold text-white/50 sm:max-w-none">{t.announce.vs}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.75, type: "spring", damping: 16 }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-3xl border p-4 transition-colors duration-300 sm:p-6",
            landed ? "border-rose-400/50 bg-rose-500/15 shadow-[0_0_60px_-10px_rgba(244,63,94,.6)]" : "border-white/10 bg-white/[.04]",
          )}
        >
          <span className="text-sm font-bold text-rose-200">🎯 {t.roles.target}</span>
          <motion.div key={landed ? "landed" : "rolling"} animate={landed ? { scale: [1.35, 1] } : undefined} transition={{ type: "spring", damping: 9 }}>
            <Avatar person={elapsed < ROLL_START ? null : shown} size={big ? "2xl" : "xl"} />
          </motion.div>
          <span className={cn("w-full truncate font-bold", big ? "text-3xl" : "text-xl", landed ? "text-white" : "text-white/40")}>
            {elapsed < ROLL_START ? "؟؟؟" : shown.name}
          </span>
        </motion.div>
      </div>

      {landed && <RoleHint className="w-full max-w-xl" />}
    </div>
  );
}
