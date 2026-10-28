import { useEffect, useRef } from "react";
import { useNow } from "../lib/clock";
import { play } from "../lib/sound";
import { cn } from "./ui";

/** شريط مؤقت متزامن مع الخادم. total بالثواني لحساب نسبة الشريط */
export function TimerBar({ deadline, total, audible, className }: { deadline: number | null; total: number; audible?: boolean; className?: string }) {
  const now = useNow(deadline !== null, 200);
  const left = deadline === null ? null : Math.max(0, (deadline - now) / 1000);
  const secs = left === null ? null : Math.ceil(left);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!audible || secs === null || secs > 5 || secs === 0 || lastTick.current === secs) return;
    lastTick.current = secs;
    play("tick");
  }, [secs, audible]);
  if (left === null || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const urgent = left <= 5;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-[width] duration-200 ease-linear", urgent ? "bg-rose-500" : "bg-linear-to-l from-violet-400 to-sky-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("min-w-10 text-center font-display text-2xl tabular-nums", urgent ? "animate-pulse text-rose-400" : "text-white/80")}>{secs}</span>
    </div>
  );
}
