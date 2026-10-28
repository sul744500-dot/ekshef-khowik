import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Standing } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { Button, Panel, cn } from "../components/ui";
import { secondsLeft, serverNow, useNow } from "../lib/clock";
import { fireworks } from "../lib/fx";
import { useT } from "../lib/lang";
import { play } from "../lib/sound";
import { useGame } from "./context";

export function VoidPhase() {
  const { t } = useT();
  const { view, act, isHost, isInvestigator, watch } = useGame();
  const r = view.round!;
  const now = useNow(view.deadline !== null, 250);
  const left = secondsLeft(view.deadline, now);
  return (
    <Panel className="mx-auto max-w-xl p-8 text-center">
      <motion.div initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", damping: 8 }} className="text-7xl">
        🙃
      </motion.div>
      <h2 className="mt-3 font-display text-4xl text-white">{t.voided.title}</h2>
      <p className="mt-2 text-lg text-white/75">{r.voided ? t.voided.reasons[r.voided] : null}</p>
      <p className="mt-4 text-sm text-white/50">{left !== null ? t.voided.auto(left) : t.voided.waiting}</p>
      {!watch && (isHost || isInvestigator) && (
        <Button className="mt-6" size="lg" onClick={() => void act({ type: "next" })}>
          {t.voided.next}
        </Button>
      )}
    </Panel>
  );
}

const PODIUM_HEIGHT = ["h-40 sm:h-48", "h-28 sm:h-36", "h-20 sm:h-28"];
const PODIUM_STYLE = [
  "from-amber-300/40 to-amber-500/10 border-amber-300/50",
  "from-slate-200/30 to-slate-400/10 border-slate-200/40",
  "from-orange-400/30 to-orange-700/10 border-orange-400/40",
];

function Podium({ standings, scoring, big }: { standings: Standing[]; scoring: boolean; big?: boolean }) {
  const top = standings.slice(0, 3);
  // الأول في الوسط
  const order = [top[1], top[0], top[2]].filter(Boolean) as Standing[];
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5">
      {order.map((s) => {
        const place = top.indexOf(s);
        return (
          <motion.div
            key={s.player.id}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + (2 - place) * 0.35, type: "spring", damping: 14 }}
            className="flex w-28 flex-col items-center sm:w-36"
          >
            {place === 0 && <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-4xl">👑</motion.div>}
            <Avatar person={s.player} size={place === 0 ? (big ? "2xl" : "xl") : "lg"} />
            <div className={cn("mt-2 w-full truncate text-center font-bold text-white", place === 0 ? "text-xl" : "text-base")}>{s.player.name}</div>
            {scoring && <div className="font-display text-2xl text-amber-300 tabular-nums">{s.score}</div>}
            <div className={cn("mt-2 grid w-full place-items-center rounded-t-2xl border border-b-0 bg-linear-to-b font-display text-4xl text-white/80", PODIUM_HEIGHT[place], PODIUM_STYLE[place])}>
              {s.rank}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function FinalPhase({ big }: { big?: boolean }) {
  const { t } = useT();
  const { view, act, isHost, watch, me } = useGame();
  const f = view.final!;
  const [showHistory, setShowHistory] = useState(false);
  const late = useRef(serverNow() - view.phaseStartedAt > 8000).current;
  useEffect(() => {
    if (late) return;
    play("win");
    fireworks();
  }, [late]);
  const scoring = view.settings.scoring;
  const tie = f.standings.length > 1 && scoring && f.standings[0].score === f.standings[1].score;

  return (
    <div className="space-y-6 pb-24">
      <div className="text-center">
        <motion.h1
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 10 }}
          className={cn("font-display text-gradient", big ? "text-8xl" : "text-6xl sm:text-7xl")}
        >
          {t.final.title}
        </motion.h1>
        <p className="mt-2 text-white/55">
          {t.final.rounds(f.rounds)}
          {tie && ` • ${t.final.tie}`}
        </p>
      </div>

      <Podium standings={f.standings} scoring={scoring} big={big} />

      {f.titles.length > 0 && (
        <div>
          <h3 className="mb-3 text-center font-display text-2xl text-white/85">🏅 {t.final.titles}</h3>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
            {f.titles.map((ti, i) => (
              <motion.div
                key={ti.kind}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: 1.4 + i * 0.2 } }}
                className="title-card flex items-center gap-4 rounded-3xl p-4"
              >
                <span className="text-5xl">{t.final.titleIcons[ti.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-2xl text-amber-200">{t.final.titleNames[ti.kind]}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar person={ti.player} size="xs" />
                    <span className="truncate font-bold text-white">{ti.player.name}</span>
                  </div>
                  <div className="text-xs text-white/55">{t.final.titleDesc[ti.kind](ti.value)}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-3 font-display text-xl text-white/85">📊 {t.final.standings}</h3>
          <ol className="space-y-1.5">
            {f.standings.map((s) => (
              <li key={s.player.id} className={cn("flex items-center gap-3 rounded-2xl bg-white/[.04] px-3 py-2", s.player.id === me?.id && "bg-violet-500/15 ring-1 ring-violet-400/30")}>
                <span className="w-6 text-center font-display text-lg text-white/50">{s.rank}</span>
                <Avatar person={s.player} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-white/90">{s.player.name}</div>
                  <div className="flex flex-wrap gap-x-2 text-[11px] text-white/45">
                    <span>🕵️ {t.stats.found(s.stats.found, s.stats.investigated)}</span>
                    <span>🎭 {t.stats.fooled(s.stats.fooled)}</span>
                    <span>🥷 {t.stats.escaped(s.stats.escaped)}</span>
                  </div>
                </div>
                {scoring && <span className="font-display text-2xl text-amber-300 tabular-nums">{s.score}</span>}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel className="p-5">
          <button onClick={() => setShowHistory((s) => !s)} className="flex w-full items-center justify-between font-display text-xl text-white/85">
            <span>📜 {t.final.history}</span>
            <span className="text-sm text-white/45 lg:hidden">{showHistory ? "▲" : "▼"}</span>
          </button>
          <ol className={cn("mt-3 space-y-2", !showHistory && "hidden lg:block")}>
            {view.history.map((h) => (
              <li key={h.no} className="rounded-2xl bg-white/[.04] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-white/60">
                    #{h.no} • {t.history.by(h.investigator.name, h.target.name)}
                  </span>
                  <span className={cn("font-bold", h.won ? "text-emerald-300" : "text-rose-300")}>{h.won ? t.history.won : t.history.lost}</span>
                </div>
                <div className="mt-1 text-sm text-white/80">❝ {h.question} ❞</div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {!watch && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-night-950 via-night-950/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <div className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row">
            {isHost ? (
              <>
                <Button block size="lg" variant="gold" onClick={() => void act({ type: "playAgain" })}>
                  🔁 {t.final.playAgain}
                </Button>
                <Button size="lg" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => void act({ type: "toLobby" })}>
                  {t.final.lobby}
                </Button>
              </>
            ) : (
              <div className="glass-strong mx-auto rounded-full px-5 py-3 text-sm text-white/70">{t.final.waitingHost}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
