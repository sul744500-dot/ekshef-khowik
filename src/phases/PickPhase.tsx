import { motion } from "motion/react";
import { Avatar } from "../components/Avatar";
import { Panel } from "../components/ui";
import { useT } from "../lib/lang";
import { play } from "../lib/sound";
import { WaitingLine } from "./common";
import { useGame } from "./context";

export function PickPhase() {
  const { t } = useT();
  const { view, act, isInvestigator, isHost, watch } = useGame();
  const r = view.round!;
  const canPick = !watch && (isInvestigator || isHost);
  const candidates = view.players.filter((p) => p.id !== r.investigator.id && p.connected);

  if (!canPick) return <WaitingLine text={t.pick.waiting(r.investigator.name)} person={r.investigator} />;

  return (
    <Panel className="mx-auto max-w-3xl p-5 sm:p-7">
      <h2 className="text-center font-display text-3xl text-white sm:text-4xl">🎯 {t.pick.title}</h2>
      {!isInvestigator && <p className="mt-2 text-center text-sm text-white/55">{t.pick.hostCanPick}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {candidates.map((p, i) => (
          <motion.button
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              play("land");
              void act({ type: "pickTarget", playerId: p.id });
            }}
            className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[.05] p-4 transition hover:border-rose-400/50 hover:bg-rose-500/10"
          >
            <Avatar person={p} size="lg" />
            <span className="w-full truncate font-semibold text-white">{p.name}</span>
          </motion.button>
        ))}
      </div>
    </Panel>
  );
}
