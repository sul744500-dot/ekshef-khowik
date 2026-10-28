import { useState } from "react";
import type { PublicPlayer } from "../../shared/types";
import { useT } from "../lib/lang";
import { useGame } from "../phases/context";
import { useRevealHold } from "../phases/revealTiming";
import { Avatar } from "./Avatar";
import { Button, Modal, ask, cn } from "./ui";

/** الترتيب بالنقاط الظاهرة (بعد تأجيل نقاط الجولة أثناء مشهد الكشف) */
function useShownPlayers() {
  const { view } = useGame();
  const hold = useRevealHold();
  const score = (p: PublicPlayer) => p.score - (hold?.[p.id] ?? 0);
  const players = view.match && view.settings.scoring ? [...view.players].sort((a, b) => score(b) - score(a) || b.stats.found - a.stats.found) : view.players;
  return { players, score, holding: !!hold };
}

function Badges({ p }: { p: PublicPlayer }) {
  const { view, masked } = useGame();
  if (masked) return null;
  return (
    <>
      {p.isHost && <span title="host">👑</span>}
      {p.role === "investigator" && <span>🕵️</span>}
      {/* أثناء الروليت لا نكشف المطلوب قبل ما يقف عليه */}
      {p.role === "target" && view.phase !== "announce" && <span>🎯</span>}
      {view.phase === "answering" && p.answered && <span className="text-emerald-400">✓</span>}
    </>
  );
}

/** أوامر صاحب الغرفة على لاعب: طرد أو نقل الإدارة */
function PlayerActions({ player, onClose }: { player: PublicPlayer | null; onClose: () => void }) {
  const { t } = useT();
  const { act } = useGame();
  return (
    <Modal open={!!player} onClose={onClose} title={player?.name}>
      {player && (
        <div className="space-y-3">
          <div className="mb-2 flex justify-center">
            <Avatar person={player} size="xl" offline={!player.connected} />
          </div>
          {player.connected && (
            <Button
              block
              variant="secondary"
              onClick={async () => {
                onClose();
                await act({ type: "makeHost", playerId: player.id });
              }}
            >
              👑 {t.lobby.makeHost}
            </Button>
          )}
          <Button
            block
            variant="danger"
            onClick={async () => {
              onClose();
              if (await ask(t.lobby.kickConfirm(player.name), true)) await act({ type: "kick", playerId: player.id });
            }}
          >
            {t.lobby.kick}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** القائمة الجانبية على الشاشات العريضة */
export function PlayersPanel() {
  const { t } = useT();
  const { view, me, isHost, show, masked } = useGame();
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const inMatch = !!view.match;
  const { players, score, holding } = useShownPlayers();
  return (
    <div className="glass sticky top-20 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="font-display text-xl text-white/90">{t.common.players}</h3>
        <span className="rounded-full bg-white/[.07] px-2.5 py-0.5 text-xs text-white/60 tabular-nums">
          {view.players.length}/{view.settings.maxPlayers}
        </span>
      </div>
      <ul className="space-y-1.5">
        {players.map((p) => {
          const shown = show(p);
          const mine = p.id === me?.id;
          return (
            <li key={p.id}>
              <button
                disabled={!isHost || mine}
                onClick={() => setSelected(p)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start transition",
                  mine ? "bg-violet-500/15 ring-1 ring-violet-400/30" : "hover:bg-white/[.05]",
                  !isHost && "cursor-default hover:bg-transparent",
                )}
              >
                <Avatar person={shown} masked={masked} size="sm" offline={!p.connected} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
                    <span className="truncate">{shown.name}</span>
                    {mine && !masked && <span className="text-[11px] font-normal text-violet-300">({t.common.you})</span>}
                    <Badges p={p} />
                  </div>
                  {!p.connected ? (
                    <div className="text-[11px] text-white/40">{t.common.offline}</div>
                  ) : inMatch && !masked && !holding ? (
                    <div className="text-[11px] text-white/45">{t.stats.found(p.stats.found, p.stats.investigated)}</div>
                  ) : null}
                </div>
                {inMatch && view.settings.scoring && <span className="font-display text-xl text-amber-300 tabular-nums">{score(p)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <PlayerActions player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** شريط اللاعبين المختصر للجوال */
export function PlayersStrip() {
  const { view, me, isHost, show, masked } = useGame();
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const inMatch = !!view.match;
  const { players, score } = useShownPlayers();
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {players.map((p) => {
        const shown = show(p);
        return (
          <button
            key={p.id}
            disabled={!isHost || p.id === me?.id}
            onClick={() => setSelected(p)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[.05] py-1 ps-1 pe-3",
              p.id === me?.id && "border-violet-400/40 bg-violet-500/15",
            )}
          >
            <Avatar person={shown} masked={masked} size="xs" offline={!p.connected} />
            <span className="max-w-20 truncate text-xs font-semibold text-white/85">{shown.name}</span>
            <span className="flex gap-0.5 text-xs">
              <Badges p={p} />
            </span>
            {inMatch && view.settings.scoring && <span className="font-display text-sm text-amber-300 tabular-nums">{score(p)}</span>}
          </button>
        );
      })}
      <PlayerActions player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
