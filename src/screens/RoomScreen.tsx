import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { PeekResult, RoomView } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { PlayersPanel, PlayersStrip } from "../components/PlayersPanel";
import { AvatarPicker, NameInput } from "../components/ProfileForm";
import { ReactionBar, ReactionLayer } from "../components/Reactions";
import { RoomMenu } from "../components/RoomMenu";
import { Button, ConfirmHost, Panel, Spinner, cn } from "../components/ui";
import { useRoom, type RoomApi } from "../hooks/useRoom";
import { errorText } from "../lib/i18n";
import { LangProvider, activeStrings, useT } from "../lib/lang";
import { usePrefs } from "../lib/prefs";
import { navigate } from "../lib/router";
import { getLastProfile, saveLastProfile } from "../lib/session";
import { copyText, roomUrl, useInviteBase } from "../lib/share";
import { vibrate } from "../lib/haptics";
import { play } from "../lib/sound";
import { toast } from "../lib/toast";
import { AnnouncePhase } from "../phases/AnnouncePhase";
import { AnsweringPhase } from "../phases/AnsweringPhase";
import { CountdownOverlay } from "../phases/Countdown";
import { FinalPhase, VoidPhase } from "../phases/EndPhases";
import { InvestigationPhase } from "../phases/InvestigationPhase";
import { Lobby } from "../phases/Lobby";
import { PickPhase } from "../phases/PickPhase";
import { QuestionPhase } from "../phases/QuestionPhase";
import { RevealPhase } from "../phases/RevealPhase";
import { GameProvider, useGame } from "../phases/context";
import { AVATARS } from "../../shared/constants";

export function Splash({ text }: { text?: string }) {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex flex-col items-center gap-5">
        <Logo size="md" />
        <div className="flex items-center gap-3 text-white/60">
          <Spinner /> {text ?? t.common.loading}
        </div>
      </div>
    </div>
  );
}

function MessageScreen({ icon, text, action }: { icon: string; text: string; action?: { label: string; onClick: () => void } }) {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <Panel className="w-full max-w-md p-8 text-center">
        <div className="text-6xl">{icon}</div>
        <p className="mt-4 text-xl font-semibold text-white/90">{text}</p>
        <div className="mt-6 flex flex-col gap-2">
          {action && (
            <Button block size="lg" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          <Button block variant="secondary" onClick={() => navigate("/")}>
            {t.join.goHome}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function JoinGate({ code, peek, api }: { code: string; peek: PeekResult; api: RoomApi }) {
  const { t } = useT();
  const last = getLastProfile();
  const [name, setName] = useState(last?.name ?? "");
  const [avatar, setAvatar] = useState(last?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const err = await api.join(name.trim(), avatar);
    setBusy(false);
    if (err) {
      setError(errorText(t, err));
      play("error");
    } else {
      saveLastProfile({ name: name.trim(), avatar });
      play("join");
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-5">
      <Logo size="md" className="justify-center" />
      <Panel className="p-6">
        <div className="mb-5 text-center">
          <div className="text-sm text-white/50">{t.join.title}</div>
          <div dir="ltr" className="font-display text-5xl tracking-[.2em] text-white">
            {code}
          </div>
        </div>
        {peek.resumable && (
          <div className="mb-5">
            <Button
              block
              size="lg"
              variant="success"
              onClick={async () => {
                const err = await api.resume();
                if (err) setError(errorText(t, err));
              }}
            >
              <Avatar person={{ avatar: peek.resumable.avatar, color: 0 }} size="xs" /> {t.join.resumeAs(peek.resumable.name)}
            </Button>
            <div className="mt-4 flex items-center gap-3 text-xs text-white/35">
              <span className="h-px flex-1 bg-white/10" />
              {t.home.or}
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}
        {peek.locked ? (
          <p className="rounded-2xl bg-amber-500/10 p-4 text-center text-amber-200">🔒 {t.errors["room-locked"]}</p>
        ) : peek.full ? (
          <p className="rounded-2xl bg-amber-500/10 p-4 text-center text-amber-200">{t.errors["room-full"]}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar person={{ avatar, color: 0 }} size="lg" />
              <NameInput value={name} onChange={setName} onEnter={join} autoFocus={!last?.name} />
            </div>
            <AvatarPicker value={avatar} onChange={setAvatar} />
            {peek.phase && peek.phase !== "lobby" && <p className="text-center text-sm text-sky-200/80">🎮 {t.join.inProgress}</p>}
            {error && <p className="text-center text-sm font-semibold text-rose-300">{error}</p>}
            <Button block size="xl" disabled={!name.trim()} busy={busy} onClick={join}>
              {t.join.enter}
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PhaseView() {
  const { view } = useGame();
  if (view.phase !== "lobby" && view.phase !== "final" && !view.round) return <Splash />;
  switch (view.phase) {
    case "lobby":
      return <Lobby />;
    case "pick":
      return <PickPhase />;
    case "announce":
      return <AnnouncePhase />;
    case "question":
      return <QuestionPhase />;
    case "answering":
      return <AnsweringPhase />;
    case "investigation":
    case "countdown":
      return <InvestigationPhase />;
    case "reveal":
      return view.round?.voided ? <VoidPhase /> : <RevealPhase />;
    case "final":
      return <FinalPhase />;
  }
}

/** مفتاح الانتقال بين الشاشات: العد التنازلي يبقى فوق شاشة التحقيق نفسها */
export const phaseKey = (v: RoomView) => `${v.phase === "countdown" ? "investigation" : v.phase}-${v.match?.seq ?? 0}`;

/** أصوات وتنبيهات عامة عند تغيّر الحالة */
function useStateCues(view: RoomView) {
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase === "lobby" && view.players.length > p.players.length) play("join");
    if (view.phase === "answering" && p.phase !== "answering") {
      play("question");
      vibrate(80);
    }
    const meId = view.me?.id;
    if (view.phase === "question" && p.phase !== "question" && view.round?.investigator.id === meId) vibrate([80, 60, 80]);
    if (view.me?.isHost && !p.me?.isHost) toast(activeStrings().lobby.nowHost, "good");
  }, [view]);
}

/** يبقي شاشة الجوال مضيئة أثناء اللعب */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // غير مدعوم أو رفضه المتصفح
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function Header({ online, onMenu }: { online: boolean; onMenu: () => void }) {
  const { t } = useT();
  const { view } = useGame();
  const { base } = useInviteBase();
  const m = view.match;
  const r = view.round;
  return (
    <header className="sticky top-0 z-40 border-b border-white/[.06] bg-night-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        <Logo size="sm" className="min-w-0 [&_div]:truncate" />
        <div className="flex-1" />
        {m && r && view.phase !== "final" && (
          <span className="hidden rounded-full bg-white/[.07] px-3 py-1 text-sm font-semibold text-white/75 sm:inline">
            {m.total ? t.common.roundOf(r.no, Math.max(m.total, r.no)) : t.common.round(r.no)}
          </span>
        )}
        <button
          dir="ltr"
          onClick={async () => toast((await copyText(roomUrl(base, view.code))) ? t.common.copied : view.code, "good")}
          className="flex items-center gap-1.5 rounded-full bg-white/[.07] px-3 py-1.5 font-display text-lg tracking-widest text-white/85 hover:bg-white/[.12]"
        >
          <span className={cn("size-2 rounded-full", online ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]" : "animate-pulse bg-rose-400")} />
          {view.code}
        </button>
        <button onClick={onMenu} aria-label={t.menu.title} className="grid size-10 place-items-center rounded-xl bg-white/[.07] text-xl text-white/85 hover:bg-white/[.12]">
          ☰
        </button>
      </div>
    </header>
  );
}

function Shell({ api }: { api: RoomApi }) {
  const { t } = useT();
  const { view } = useGame();
  const [menu, setMenu] = useState(false);
  useStateCues(view);
  useWakeLock();
  const wide = view.phase === "lobby" || view.phase === "final";

  return (
    <div className="min-h-dvh">
      <Header online={api.online} onMenu={() => setMenu(true)} />
      <AnimatePresence>
        {!api.online && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-rose-500/20 text-center text-sm font-semibold text-rose-100"
          >
            <div className="flex items-center justify-center gap-2 py-2">
              <Spinner className="size-4" /> {t.join.reconnecting}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <main className={cn("mx-auto w-full max-w-7xl px-4 pt-4", wide ? "pb-6" : "pb-32")}>
        {!wide && (
          <div className="mb-4 lg:hidden">
            <PlayersStrip />
          </div>
        )}
        <div className={cn(!wide && "lg:grid lg:grid-cols-[minmax(0,1fr)_290px] lg:gap-6")}>
          <motion.section
            key={phaseKey(view)}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="min-w-0"
          >
            <PhaseView />
          </motion.section>
          {!wide && (
            <aside className="hidden lg:block">
              <PlayersPanel />
            </aside>
          )}
        </div>
      </main>
      {!wide && <ReactionBar />}
      <ReactionLayer />
      <AnimatePresence>{view.phase === "countdown" && <CountdownOverlay />}</AnimatePresence>
      <RoomMenu open={menu} onClose={() => setMenu(false)} onLeave={api.leave} />
    </div>
  );
}

function RoomBody({ code, api }: { code: string; api: RoomApi }) {
  const { t } = useT();
  const { view, conn } = api;
  switch (conn.kind) {
    case "loading":
      return <Splash />;
    case "join":
      return <JoinGate code={code} peek={conn.peek} api={api} />;
    case "missing":
      return <MessageScreen icon="🔍" text={t.join.missing} />;
    case "kicked":
      return <MessageScreen icon="🥾" text={t.join.kicked} />;
    case "left":
      return <MessageScreen icon="👋" text={t.join.left} action={{ label: t.join.rejoin, onClick: () => location.reload() }} />;
    case "replaced":
      return <MessageScreen icon="📱" text={t.join.replaced} action={{ label: t.join.replacedAction, onClick: () => void api.resume() }} />;
    case "in":
      if (!view) return <Splash />;
      return (
        <GameProvider view={view} act={api.act}>
          <Shell api={api} />
        </GameProvider>
      );
  }
}

export function RoomScreen({ code }: { code: string }) {
  const api = useRoom(code);
  const prefs = usePrefs();
  const roomLang = api.view?.settings.language ?? (api.conn.kind === "join" ? api.conn.peek.language : undefined) ?? prefs.homeLang;
  const lang = prefs.roomLang === "auto" ? roomLang : prefs.roomLang;
  useEffect(() => {
    document.title = lang === "ar" ? `اكشف خويك • ${code}` : `Expose Your Friend • ${code}`;
  }, [lang, code]);
  return (
    <LangProvider lang={lang}>
      <RoomBody code={code} api={api} />
      <ConfirmHost />
    </LangProvider>
  );
}
