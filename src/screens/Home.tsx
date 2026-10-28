import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AVATARS, ROOM_CODE_LENGTH, normalizeRoomCode } from "../../shared/constants";
import type { JoinResult } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { HowToPlay } from "../components/HowToPlay";
import { Logo } from "../components/Logo";
import { AvatarPicker, NameInput } from "../components/ProfileForm";
import { Button, ConfirmHost, Panel } from "../components/ui";
import { errorText } from "../lib/i18n";
import { LangProvider, useT } from "../lib/lang";
import { setPrefs, usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { getLastProfile, saveLastProfile, saveToken } from "../lib/session";
import { request } from "../lib/socket";
import { play } from "../lib/sound";

// بطاقات استعراضية في الخلفية توضّح فكرة اللعبة
const DEMO = [
  { ar: "بشتري هايلكس وأطلع أطعس", en: "Buy a pickup truck and go dune bashing", out: false },
  { ar: "بعطي أبوي وأمي نص المبلغ", en: "Give half to my parents", out: true },
  { ar: "بحجز تذكرة لليابان", en: "Book a ticket to Japan", out: true },
];

function HomeBody() {
  const { t, lang } = useT();
  const last = getLastProfile();
  const [name, setName] = useState(last?.name ?? "");
  const [avatar, setAvatar] = useState(last?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickAvatar, setPickAvatar] = useState(!last);

  const go = async (kind: "create" | "join") => {
    if (busy) return;
    if (!name.trim()) {
      setError(t.errors["name-required"]);
      play("error");
      return;
    }
    if (kind === "join" && code.length !== ROOM_CODE_LENGTH) {
      setError(t.errors["room-not-found"]);
      play("error");
      return;
    }
    setBusy(kind);
    setError(null);
    const payload = { name: name.trim(), avatar, ...(kind === "join" ? { code } : {}) };
    const r = await request<JoinResult>(kind === "create" ? "room:create" : "room:join", payload);
    setBusy(null);
    if (!r.ok) {
      setError(errorText(t, r.error));
      play("error");
      return;
    }
    saveLastProfile({ name: name.trim(), avatar });
    saveToken(r.code, r.token);
    play("join");
    navigate(`/r/${r.code}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <nav className="flex items-center justify-end py-4">
        <button
          onClick={() => setPrefs({ homeLang: lang === "ar" ? "en" : "ar" })}
          className="rounded-full border border-white/12 bg-white/[.06] px-4 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/[.12]"
        >
          🌐 {lang === "ar" ? "English" : "العربية"}
        </button>
      </nav>

      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* البطل */}
        <div className="text-center lg:text-start">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Logo size="lg" className="justify-center lg:justify-start" />
            <p className="mt-5 text-xl font-medium leading-relaxed text-white/75 sm:text-2xl">{t.tagline}</p>
          </motion.div>
          <div className="relative mx-auto mt-10 hidden h-80 max-w-md lg:mx-0 lg:block">
            {DEMO.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30, rotate: 0 }}
                animate={{ opacity: 1, y: 0, rotate: [-4, 3, -2][i] }}
                transition={{ delay: 0.4 + i * 0.15, type: "spring", damping: 14 }}
                className={`answer-card absolute w-80 rounded-3xl p-5 pt-7 ${d.out ? "answer-card-out" : "last-card"}`}
                style={{ top: i * 96, insetInlineStart: i * 36, zIndex: 3 - i }}
              >
                <span
                  className={`absolute -top-3.5 start-4 grid size-9 place-items-center rounded-xl font-display text-xl ${d.out ? "bg-slate-600/80 text-white/60" : "bg-linear-to-br from-violet-500 to-sky-500"}`}
                >
                  {i + 1}
                </span>
                <p className={`pe-10 text-lg font-semibold ${d.out ? "text-white/40" : ""}`}>{lang === "ar" ? d.ar : d.en}</p>
                <span className={`absolute end-5 top-1/2 -translate-y-1/2 text-3xl ${d.out ? "font-display text-rose-500/80" : ""}`}>{d.out ? "✕" : "🎯"}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* الدخول */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
          <Panel className="p-5 sm:p-7">
            <h2 className="mb-4 font-display text-2xl text-white">{t.home.profileTitle}</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => setPickAvatar((v) => !v)} className="rounded-full transition hover:scale-105" aria-label={t.home.avatar}>
                <Avatar person={{ avatar, color: 0 }} size="lg" />
              </button>
              <NameInput value={name} onChange={setName} onEnter={() => go(code.length === ROOM_CODE_LENGTH ? "join" : "create")} autoFocus={!last?.name} />
            </div>
            {pickAvatar ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-white/50">{t.home.avatar}</div>
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </div>
            ) : (
              <button onClick={() => setPickAvatar(true)} className="mt-2 text-xs font-medium text-violet-300">
                {t.home.avatar}
              </button>
            )}

            <Button block size="xl" className="mt-6" busy={busy === "create"} onClick={() => go("create")}>
              ✨ {t.home.create}
            </Button>
            <p className="mt-2 text-center text-xs text-white/45">{t.home.createHint}</p>

            <div className="my-5 flex items-center gap-3 text-xs text-white/35">
              <span className="h-px flex-1 bg-white/10" />
              {t.home.or}
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex gap-2">
              <input
                dir="ltr"
                value={code}
                inputMode="numeric"
                autoComplete="off"
                maxLength={ROOM_CODE_LENGTH + 4}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && go("join")}
                placeholder={t.home.codePlaceholder}
                className="field h-14 min-w-0 flex-1 rounded-2xl px-4 text-center font-display text-3xl tracking-[.3em] placeholder:font-sans placeholder:text-base placeholder:tracking-normal"
              />
              <Button size="lg" variant="secondary" busy={busy === "join"} disabled={code.length !== ROOM_CODE_LENGTH} onClick={() => go("join")}>
                {t.home.join}
              </Button>
            </div>
            {error && <p className="mt-3 text-center text-sm font-semibold text-rose-300">{error}</p>}
          </Panel>
        </motion.div>
      </div>

      <section className="mx-auto mt-14 max-w-3xl">
        <h2 className="mb-5 text-center font-display text-3xl text-white">🎭 {t.how.title}</h2>
        <HowToPlay />
      </section>
      <p className="mt-10 text-center text-sm text-white/35">{t.home.footer}</p>
    </div>
  );
}

export function Home() {
  const { homeLang } = usePrefs();
  useEffect(() => {
    document.title = homeLang === "ar" ? "اكشف خويك | Expose Your Friend" : "Expose Your Friend | اكشف خويك";
  }, [homeLang]);
  return (
    <LangProvider lang={homeLang}>
      <HomeBody />
      <ConfirmHost />
    </LangProvider>
  );
}
