// مؤثرات صوتية قصيرة مولّدة بـ Web Audio (بدون ملفات ولا موسيقى خلفية).
// تعمل بعد أول لمسة من اللاعب، وتُكتم من إعدادات الغرفة أو من جهاز اللاعب.

import { getPrefs } from "./prefs";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let roomSounds = true;

/** إعداد الغرفة (يتحكم فيه صاحب الغرفة) */
export function setRoomSounds(on: boolean) {
  roomSounds = on;
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  master!.gain.value = getPrefs().volume;
  return { ctx, out: master! };
}

/** يُستدعى مع أول تفاعل للاعب (شرط Safari لتشغيل الصوت) */
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  const src = a.ctx.createBufferSource();
  src.buffer = a.ctx.createBuffer(1, 1, 22050);
  src.connect(a.out);
  src.start(0);
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  vibrato?: number;
}

function tone({ freq, to, dur, type = "sine", gain = 0.25, delay = 0, vibrato = 0 }: ToneOpts) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vibrato) {
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  from?: number;
  to?: number;
  delay?: number;
  type?: BiquadFilterType;
}

function noise({ dur, gain = 0.2, from = 400, to = 3000, delay = 0, type = "bandpass" }: NoiseOpts) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + delay;
  const len = Math.ceil(a.ctx.sampleRate * dur);
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const SOUNDS = {
  tap() {
    tone({ freq: 880, dur: 0.05, type: "triangle", gain: 0.08 });
  },
  join() {
    tone({ freq: 660, dur: 0.12, type: "triangle", gain: 0.16 });
    tone({ freq: 990, dur: 0.22, type: "triangle", gain: 0.14, delay: 0.09 });
  },
  /** إعلان المحقق والمطلوب */
  whoosh() {
    noise({ dur: 0.55, gain: 0.25, from: 300, to: 5000 });
    tone({ freq: 196, to: 392, dur: 0.5, type: "sawtooth", gain: 0.05 });
  },
  /** دقة الروليت */
  roll() {
    tone({ freq: 1400, dur: 0.03, type: "square", gain: 0.035 });
  },
  /** هبوط الاختيار */
  land() {
    tone({ freq: 523.25, dur: 0.16, type: "triangle", gain: 0.2 });
    tone({ freq: 783.99, dur: 0.3, type: "triangle", gain: 0.18, delay: 0.1 });
    tone({ freq: 1046.5, dur: 0.45, type: "sine", gain: 0.12, delay: 0.2 });
  },
  question() {
    tone({ freq: 440, to: 880, dur: 0.16, type: "triangle", gain: 0.2 });
    tone({ freq: 660, to: 1320, dur: 0.22, type: "sine", gain: 0.15, delay: 0.1 });
  },
  send() {
    noise({ dur: 0.32, gain: 0.2, from: 600, to: 5000 });
    tone({ freq: 620, to: 1240, dur: 0.16, type: "triangle", gain: 0.14, delay: 0.18 });
  },
  /** توزيع البطاقات */
  deal() {
    for (let i = 0; i < 7; i++) noise({ dur: 0.06, gain: 0.22, from: 1800, to: 2800, delay: i * 0.07, type: "highpass" });
    tone({ freq: 784, dur: 0.22, type: "triangle", gain: 0.15, delay: 0.55 });
  },
  arm() {
    tone({ freq: 330, to: 300, dur: 0.09, type: "square", gain: 0.06 });
  },
  /** ضربة الاستبعاد */
  eliminate() {
    noise({ dur: 0.18, gain: 0.45, from: 6000, to: 800, type: "highpass" });
    noise({ dur: 0.25, gain: 0.5, from: 900, to: 100, type: "lowpass", delay: 0.06 });
    tone({ freq: 150, to: 45, dur: 0.32, type: "sine", gain: 0.55, delay: 0.06 });
  },
  /** آخر ثواني المؤقت */
  tick() {
    tone({ freq: 1200, dur: 0.04, type: "square", gain: 0.05 });
  },
  /** طبول العد التنازلي */
  drum() {
    for (let i = 0; i < 26; i++) {
      const d = (i / 26) ** 0.8 * 2.7;
      noise({ dur: 0.08, gain: 0.12 + i * 0.012, from: 220, to: 120, type: "lowpass", delay: d });
    }
  },
  beep() {
    tone({ freq: 740, dur: 0.14, type: "square", gain: 0.08 });
  },
  /** لحظة الكشف */
  hit() {
    tone({ freq: 90, to: 40, dur: 0.6, type: "sine", gain: 0.7 });
    noise({ dur: 0.5, gain: 0.35, from: 3000, to: 200, type: "lowpass" });
    [261.63, 329.63, 392, 523.25].forEach((f) => tone({ freq: f, dur: 0.7, type: "sawtooth", gain: 0.04, delay: 0.03 }));
  },
  /** يظهر صاحب بطاقة */
  flip() {
    tone({ freq: 520, to: 780, dur: 0.1, type: "triangle", gain: 0.12 });
  },
  /** انكشفت بطاقة المطلوب بين المستبعدة */
  gasp() {
    tone({ freq: 660, to: 220, dur: 0.5, type: "sawtooth", gain: 0.07 });
    noise({ dur: 0.4, gain: 0.12, from: 2000, to: 300 });
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.2, delay: i * 0.1 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone({ freq: f, dur: 1.1, type: "sine", gain: 0.09, delay: 0.45 }));
    tone({ freq: 1568, dur: 0.9, type: "triangle", gain: 0.07, delay: 0.5 });
  },
  /** ترومبون حزين */
  lose() {
    [392, 369.99, 349.23].forEach((f, i) => tone({ freq: f, dur: 0.32, type: "sawtooth", gain: 0.09, delay: i * 0.34 }));
    tone({ freq: 329.63, to: 300, dur: 0.9, type: "sawtooth", gain: 0.09, delay: 1.02, vibrato: 6 });
  },
  pop() {
    tone({ freq: 500, to: 900, dur: 0.08, type: "sine", gain: 0.1 });
  },
  error() {
    tone({ freq: 200, to: 150, dur: 0.18, type: "square", gain: 0.06 });
  },
} as const;

export type SoundName = keyof typeof SOUNDS;

export function play(name: SoundName) {
  const prefs = getPrefs();
  if (!roomSounds || !prefs.sound || prefs.volume <= 0) return;
  try {
    SOUNDS[name]();
  } catch {
    // المتصفح رفض تشغيل الصوت: نتجاهل بهدوء
  }
}
