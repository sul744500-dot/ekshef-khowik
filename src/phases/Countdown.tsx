import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useNow } from "../lib/clock";
import { useT } from "../lib/lang";
import { vibrate } from "../lib/haptics";
import { play } from "../lib/sound";
import { useGame } from "./context";

/** عد تنازلي حماسي قبل كشف الهويات (متزامن مع موعد الخادم) */
export function CountdownOverlay() {
  const { t } = useT();
  const { view } = useGame();
  const now = useNow(true, 80);
  const left = Math.max(0, (view.deadline ?? now) - now);
  const n = Math.max(1, Math.min(3, Math.ceil(left / 1100)));

  useEffect(() => {
    play("drum");
    vibrate([40, 60, 40]);
  }, []);
  useEffect(() => {
    play("beep");
  }, [n]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-night-950/85 backdrop-blur-md"
    >
      <div className="spotlight pointer-events-none absolute inset-0" />
      <div className="relative text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl text-white/75 sm:text-4xl">
          {t.countdown.ready}
        </motion.div>
        <div className="relative grid h-60 place-items-center sm:h-80">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={n}
              initial={{ scale: 2.8, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 220 }}
              className="font-display text-[11rem] leading-none text-gradient drop-shadow-[0_0_50px_rgba(167,139,250,.7)] sm:text-[16rem]"
            >
              {n}
            </motion.div>
          </AnimatePresence>
          <motion.span
            key={`ring-${n}`}
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute size-40 rounded-full border-4 border-violet-400/70"
          />
        </div>
        <div className="text-5xl">🔍</div>
      </div>
    </motion.div>
  );
}
