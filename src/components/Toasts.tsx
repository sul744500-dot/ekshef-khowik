import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "../lib/toast";
import { cn } from "./ui";

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={cn(
              "glass-strong max-w-md rounded-2xl px-4 py-2.5 text-center text-sm font-medium shadow-xl",
              t.kind === "bad" && "text-rose-200 ring-1 ring-rose-400/40",
              t.kind === "good" && "text-emerald-200 ring-1 ring-emerald-400/40",
              t.kind === "info" && "text-white/90",
            )}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
