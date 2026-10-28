import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { REACTIONS } from "../../shared/constants";
import type { ReactionEvent } from "../../shared/types";
import { useT } from "../lib/lang";
import { getSocket } from "../lib/socket";
import { play } from "../lib/sound";
import { useGame } from "../phases/context";
import { Avatar } from "./Avatar";
import { cn } from "./ui";

interface Floating extends ReactionEvent {
  x: number;
  drift: number;
}

/** الإيموجيات الطائرة من كل اللاعبين */
export function ReactionLayer({ big }: { big?: boolean }) {
  const { player, show, masked } = useGame();
  const [items, setItems] = useState<Floating[]>([]);
  useEffect(() => {
    const s = getSocket();
    const onReaction = (e: ReactionEvent) => {
      const item: Floating = { ...e, x: 8 + Math.random() * 84, drift: (Math.random() - 0.5) * 80 };
      setItems((list) => [...list.slice(-24), item]);
      play("pop");
      setTimeout(() => setItems((list) => list.filter((i) => i.id !== e.id)), 2600);
    };
    s.on("reaction", onReaction);
    return () => {
      s.off("reaction", onReaction);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {items.map((r) => {
          const p = show(player(r.playerId));
          return (
            <motion.div
              key={r.id}
              className="absolute bottom-20 flex flex-col items-center"
              style={{ left: `${r.x}%` }}
              initial={{ y: 40, opacity: 0, scale: 0.4 }}
              animate={{ y: big ? -520 : -360, x: r.drift, opacity: [0, 1, 1, 0], scale: [0.4, 1.25, 1, 0.9] }}
              transition={{ duration: 2.5, ease: "easeOut" }}
            >
              <span className={cn("drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]", big ? "text-7xl" : "text-5xl")}>{r.emoji}</span>
              {!masked && (
                <span className="mt-1 flex items-center gap-1 rounded-full bg-night-950/70 px-2 py-0.5 text-[11px] text-white/80">
                  <Avatar person={p} size="xs" className="!size-4 !text-[10px]" />
                  {p.name}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** أزرار إرسال ردود الفعل */
export function ReactionBar() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  const send = (emoji: string) => {
    const now = Date.now();
    if (now - last.current < 350) return;
    last.current = now;
    getSocket().emit("react", { emoji });
  };
  const buttons = REACTIONS.map((e) => (
    <button
      key={e}
      onClick={() => send(e)}
      className="grid size-11 place-items-center rounded-full text-2xl transition hover:scale-125 hover:bg-white/10 active:scale-95"
      aria-label={e}
    >
      {e}
    </button>
  ));
  return (
    <>
      {/* شاشات عريضة: شريط كامل */}
      <div className="fixed bottom-4 left-1/2 z-30 hidden -translate-x-1/2 sm:block">
        <div className="glass-strong flex items-center gap-0.5 rounded-full px-2 py-1">{buttons}</div>
      </div>
      {/* الجوال: زر يفتح القائمة */}
      <div className="fixed bottom-4 end-4 z-30 sm:hidden">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              className="glass-strong absolute bottom-16 end-0 grid w-max grid-cols-5 gap-1 rounded-3xl p-2"
            >
              {buttons}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={t.reactions}
          className={cn("glass-strong grid size-14 place-items-center rounded-full text-2xl shadow-xl transition", open && "ring-2 ring-violet-400/60")}
        >
          {open ? "✕" : "😂"}
        </button>
      </div>
    </>
  );
}
