import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { AckResult, RoomView } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { QR } from "../components/QR";
import { ReactionLayer } from "../components/Reactions";
import { Scoreboard } from "../components/Scoreboard";
import { Panel, cn } from "../components/ui";
import { syncClock } from "../lib/clock";
import { LangProvider, useT } from "../lib/lang";
import { usePrefs } from "../lib/prefs";
import { roomUrl, useInviteBase } from "../lib/share";
import { getSocket, request } from "../lib/socket";
import { setRoomSounds } from "../lib/sound";
import { AnnouncePhase } from "../phases/AnnouncePhase";
import { AnsweringPhase } from "../phases/AnsweringPhase";
import { CountdownOverlay } from "../phases/Countdown";
import { FinalPhase, VoidPhase } from "../phases/EndPhases";
import { InvestigationPhase } from "../phases/InvestigationPhase";
import { PickPhase } from "../phases/PickPhase";
import { QuestionPhase } from "../phases/QuestionPhase";
import { RevealPhase } from "../phases/RevealPhase";
import { GameProvider, useGame } from "../phases/context";
import { Splash, phaseKey } from "./RoomScreen";

// شاشة البث (OBS أو تلفزيون): تستلم الحالة العامة فقط من الخادم، بدون أي سر وبدون تحكم

function useWatch(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const watch = async () => {
      const r = await request("room:watch", { code });
      if (!r.ok && r.error === "room-not-found") setMissing(true);
    };
    const onState = (v: RoomView) => {
      if (v.code !== code) return;
      syncClock(v.serverNow);
      setRoomSounds(v.settings.sounds);
      setView(v);
      setMissing(false);
    };
    const onClosed = () => setMissing(true);
    s.on("connect", watch);
    s.on("room:state", onState);
    s.on("room:closed", onClosed);
    if (s.connected) void watch();
    return () => {
      s.off("connect", watch);
      s.off("room:state", onState);
      s.off("room:closed", onClosed);
    };
  }, [code]);
  return { view, missing };
}

function StreamLobby() {
  const { t } = useT();
  const { view } = useGame();
  const { base } = useInviteBase();
  const url = roomUrl(base, view.code);
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-4">
        <QR value={url} className="size-64 xl:size-80" />
        <div className="text-center">
          <div className="text-lg text-white/60">{t.stream.join}</div>
          <div dir="ltr" className="font-display text-7xl tracking-[.2em] text-white xl:text-8xl">
            {view.code}
          </div>
          <div dir="ltr" className="text-white/45">
            {url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
      <div>
        <h2 className="mb-6 font-display text-5xl text-white">{t.stream.waiting}</h2>
        <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
          <AnimatePresence>
            {view.players.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="flex flex-col items-center gap-2 rounded-3xl bg-white/[.05] p-4"
              >
                <Avatar person={p} size="xl" offline={!p.connected} />
                <span className="w-full truncate text-center text-xl font-bold text-white">
                  {p.isHost && "👑 "}
                  {p.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StreamStage() {
  const { view } = useGame();
  switch (view.phase) {
    case "lobby":
      return <StreamLobby />;
    case "pick":
      return <PickPhase />;
    case "announce":
      return <AnnouncePhase big />;
    case "question":
      return <QuestionPhase />;
    case "answering":
      return <AnsweringPhase big />;
    case "investigation":
    case "countdown":
      return <InvestigationPhase big />;
    case "reveal":
      return view.round?.voided ? <VoidPhase /> : <RevealPhase big />;
    case "final":
      return <FinalPhase big />;
  }
}

function StreamBody() {
  const { t } = useT();
  const { view } = useGame();
  const showSide = view.phase !== "lobby" && view.phase !== "final";
  const m = view.match;
  const r = view.round;
  return (
    <div className="min-h-dvh px-6 py-5 xl:px-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Logo size="md" />
        <div className="flex items-center gap-3">
          {m && r && view.phase !== "final" && (
            <span className="rounded-full bg-white/[.07] px-4 py-1.5 text-lg font-semibold text-white/80">
              {m.total ? t.common.roundOf(r.no, Math.max(m.total, r.no)) : t.common.round(r.no)}
            </span>
          )}
          <span dir="ltr" className="rounded-full bg-white/[.07] px-4 py-1.5 font-display text-2xl tracking-widest text-white/85">
            {view.code}
          </span>
        </div>
      </header>
      <div className={cn(showSide && "grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]")}>
        {/* بدون AnimatePresence: كان يعيد تركيب الشاشة مع كل حركة layout داخلها */}
        <motion.main key={phaseKey(view)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
          <StreamStage />
        </motion.main>
        {showSide && (
          <aside className="hidden xl:block">
            <Panel className="sticky top-5 p-5">
              <h3 className="mb-3 font-display text-2xl text-white/85">🏆 {t.scoreboard.title}</h3>
              {view.settings.streamerMode && (view.phase === "investigation" || view.phase === "countdown") ? (
                <p className="py-8 text-center text-white/40">🔒 {t.common.hidden}</p>
              ) : (
                <Scoreboard big />
              )}
            </Panel>
          </aside>
        )}
      </div>
      <ReactionLayer big />
      <AnimatePresence>{view.phase === "countdown" && <CountdownOverlay />}</AnimatePresence>
    </div>
  );
}

export function StreamScreen({ code }: { code: string }) {
  const { view, missing } = useWatch(code);
  const prefs = usePrefs();
  const lang = prefs.roomLang === "auto" ? (view?.settings.language ?? prefs.homeLang) : prefs.roomLang;
  const act = useCallback(async (): Promise<AckResult> => ({ ok: false, error: "not-allowed", quiet: true }), []);
  return (
    <LangProvider lang={lang}>
      {missing ? (
        <StreamMissing />
      ) : !view ? (
        <Splash />
      ) : (
        <GameProvider view={view} act={act} watch>
          <StreamBody />
        </GameProvider>
      )}
    </LangProvider>
  );
}

function StreamMissing() {
  const { t } = useT();
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <Logo size="lg" className="justify-center" />
        <p className="mt-6 text-2xl text-white/60">{t.stream.noRoom}</p>
      </div>
    </div>
  );
}
