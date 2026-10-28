import { randomBytes, randomInt } from "node:crypto";

export type RandInt = (maxExclusive: number) => number;

/** رقم عشوائي آمن (crypto) لاختيار الأدوار وخلط البطاقات */
export const secureRandInt: RandInt = (max) => randomInt(max);

/** خلط Fisher–Yates بمولّد آمن */
export function shuffle<T>(items: readonly T[], rand: RandInt): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomId(bytes = 8): string {
  return randomBytes(bytes).toString("hex");
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// محارف التحكم واتجاه النص (قد تُستخدم لقلب عرض النص أو إخفاء محتوى)
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F؜​‪-‮⁦-⁩﻿]/g;

/** ينظف نص اللاعب: يحذف محارف التحكم، يوحّد المسافات، ويقص على الطول المسموح (بالمحارف لا بالبايت) */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const text = raw.normalize("NFC").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trim() : text;
}

export const charLength = (s: string) => Array.from(s).length;
