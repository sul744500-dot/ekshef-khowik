import { useSyncExternalStore } from "react";
import type { Lang } from "../../shared/types";

// تفضيلات هذا الجهاز فقط (الصوت واللغة)، وتختلف عن إعدادات الغرفة المشتركة

export interface Prefs {
  sound: boolean;
  volume: number;
  /** لغة الجهاز داخل الغرفة: auto = نفس لغة الغرفة */
  roomLang: Lang | "auto";
  /** لغة الصفحة الرئيسية */
  homeLang: Lang;
}

const KEY = "ekshef:prefs";
const DEFAULTS: Prefs = { sound: true, volume: 0.8, roomLang: "auto", homeLang: "ar" };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

let current: Prefs = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

export const getPrefs = () => current;

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // التخزين غير متاح (تصفح خاص): تبقى التفضيلات لهذه الجلسة فقط
  }
  for (const l of listeners) l();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULTS,
  );
}
