import { useEffect, useState } from "react";

// فرق الساعة بين الجهاز والخادم، لتتطابق المؤقتات على كل الأجهزة

let offset = 0;
let synced = false;

export function syncClock(serverNow: number) {
  const sample = serverNow - Date.now();
  offset = !synced || Math.abs(sample - offset) > 1500 ? sample : offset * 0.8 + sample * 0.2;
  synced = true;
}

export const serverNow = () => Date.now() + offset;

/** يعيد رسم المكوّن دوريًا ويعيد وقت الخادم الحالي */
export function useNow(active = true, interval = 250): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((x) => x + 1), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return serverNow();
}

/** الثواني المتبقية حتى موعد الخادم */
export function secondsLeft(deadline: number | null, now: number): number | null {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
