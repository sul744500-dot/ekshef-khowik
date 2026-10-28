import type { RevealView } from "../../shared/types";
import { serverNow, useNow } from "../lib/clock";
import { useGame } from "./context";

/** الخط الزمني لمشهد الكشف بالملّي ثانية من بداية المرحلة */
export const REVEAL = { land: 1700, verdict: 2300, outStart: 3300, outStep: 520 } as const;

export const revealDuration = (rv: RevealView) => REVEAL.outStart + rv.cards.filter((c) => c.out).length * REVEAL.outStep + 300;

/**
 * النقاط الجديدة تصل مع بداية الكشف، فنؤجل عرضها في اللوحات حتى ينتهي المشهد
 * (وإلا تكشف لوحة الترتيب النتيجة قبل الحركة). يعيد النقاط المؤجلة لكل لاعب، أو null بعد انتهاء المشهد.
 */
export function useRevealHold(): Record<string, number> | null {
  const { view } = useGame();
  const rv = view.phase === "reveal" ? view.round?.reveal : null;
  const doneAt = rv ? view.phaseStartedAt + revealDuration(rv) : 0;
  const now = useNow(!!rv && serverNow() < doneAt, 300);
  if (!rv || now >= doneAt) return null;
  const held: Record<string, number> = {};
  for (const a of rv.awards) held[a.player.id] = (held[a.player.id] ?? 0) + a.points;
  return held;
}
