import type { Settings } from "./types";

export const ROOM_CODE_LENGTH = 5;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;

export const LIMITS = { name: 16, question: 180, answer: 150 } as const;
export const MIN_QUESTION_LENGTH = 3;

/** نظام النقاط: كشف ناجح للمحقق، نجاة للشخص المطلوب، ومكافأة خداع لصاحب البطاقة الأخيرة */
export const POINTS = { found: 100, escaped: 100, fooled: 50 } as const;

export const TIMING = {
  announceMs: 6500,
  announceShortMs: 4000,
  countdownMs: 3600,
  /** الجولة الملغاة تنتقل للتالية تلقائيًا بعد هذه المدة */
  voidNextMs: 8000,
  /** مهلة غياب صاحب الغرفة قبل نقل الإدارة */
  hostGraceMs: 45_000,
  /** مهلة غياب لاعب لم يجب قبل تجاهله */
  answererGraceMs: 45_000,
  targetGraceMs: 60_000,
  investigatorGraceMs: 75_000,
} as const;

export const TIME_CHOICES = {
  questionTime: [0, 30, 45, 60, 90],
  answerTime: [0, 30, 45, 60, 90, 120],
  decisionTime: [0, 10, 15, 20, 30],
} as const;

export const ROUND_LIMITS = {
  cycles: { min: 1, max: 3 },
  fixed: { min: 1, max: 30 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 10,
  language: "ar",
  questionTime: 0,
  answerTime: 0,
  decisionTime: 0,
  roundMode: "cycles",
  roundCount: 1,
  targetMode: "random",
  scoring: true,
  sounds: true,
  streamerMode: false,
  locked: false,
};

export const AVATARS = [
  "🦊", "🐼", "🦁", "🐯", "🐸", "🐵", "🦄", "🐙",
  "🐲", "👽", "🤖", "👻", "🦉", "🐧", "🐨", "🐰",
  "🐻", "🦝", "🐝", "🦖", "🐺", "🦩", "🐳", "🦈",
  "🐮", "🐷", "🐔", "🦜", "🐢", "🦔", "🐹", "🐱",
] as const;

/** عدد ألوان اللاعبين (تُعرّف درجاتها في الواجهة) */
export const PLAYER_COLORS = 12;

export const REACTIONS = ["😂", "🔥", "😱", "👀", "🤔", "💀", "👏", "🤡", "😭", "🫣"] as const;

/** يحوّل الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى أرقام لاتينية */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

export function normalizeRoomCode(raw: string): string {
  return normalizeDigits(raw).replace(/\D/g, "").slice(0, ROOM_CODE_LENGTH);
}
