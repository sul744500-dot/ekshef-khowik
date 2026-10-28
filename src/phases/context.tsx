import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AckResult, GameAction, PersonRef, PublicPlayer, RoomView } from "../../shared/types";
import { useT } from "../lib/lang";

export interface Game {
  view: RoomView;
  /** اللاعب الحالي، أو null في شاشة البث */
  me: PublicPlayer | null;
  isHost: boolean;
  /** شاشة البث: عرض فقط بدون أي تحكم */
  watch: boolean;
  act: (a: GameAction) => Promise<AckResult>;
  /** وضع البث مفعّل والأسماء مخفية الآن */
  masked: boolean;
  /** الشخص كما يُعرض على هذه الشاشة (مخفي في وضع البث) */
  show: (p: PersonRef | null | undefined) => PersonRef;
  player: (id: string | null | undefined) => PublicPlayer | undefined;
  isInvestigator: boolean;
  isTarget: boolean;
  hostName: string;
}

const GameContext = createContext<Game | null>(null);

export function GameProvider({ view, act, watch = false, children }: { view: RoomView; act: Game["act"]; watch?: boolean; children: ReactNode }) {
  const { t } = useT();
  const value = useMemo<Game>(() => {
    const me = view.me ? (view.players.find((p) => p.id === view.me!.id) ?? null) : null;
    const masked = view.settings.streamerMode && (view.phase === "investigation" || view.phase === "countdown");
    const hidden: PersonRef = { id: "", name: t.common.hidden, avatar: "👤", color: 0 };
    const host = view.players.find((p) => p.id === view.hostId);
    return {
      view,
      me,
      isHost: !!view.me?.isHost,
      watch,
      act,
      masked,
      show: (p) => (!p ? hidden : masked ? { ...hidden, id: p.id } : p),
      player: (id) => (id ? view.players.find((p) => p.id === id) : undefined),
      isInvestigator: !!me && view.round?.investigator.id === me.id,
      isTarget: !!me && view.round?.target?.id === me.id,
      hostName: host?.name ?? "",
    };
  }, [view, act, watch, t]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error("useGame outside GameProvider");
  return g;
}
