import { useState, type ReactNode } from "react";
import { useT } from "../lib/lang";
import { setPrefs, usePrefs } from "../lib/prefs";
import { copyText, roomUrl, useInviteBase, watchUrl } from "../lib/share";
import { toast } from "../lib/toast";
import { useGame } from "../phases/context";
import { SettingsPanel } from "../phases/SettingsPanel";
import { HowToPlay } from "./HowToPlay";
import { Scoreboard } from "./Scoreboard";
import { Choice, Modal, Toggle, ask, cn } from "./ui";

function Item({ icon, children, onClick, danger }: { icon: string; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start font-medium transition",
        danger ? "text-rose-300 hover:bg-rose-500/10" : "text-white/85 hover:bg-white/[.06]",
      )}
    >
      <span className="w-6 text-center text-lg">{icon}</span>
      {children}
    </button>
  );
}

type Sheet = "menu" | "settings" | "scores" | "how" | null;

export function RoomMenu({ open, onClose, onLeave }: { open: boolean; onClose: () => void; onLeave: () => Promise<void> }) {
  const { t } = useT();
  const { view, isHost, act } = useGame();
  const prefs = usePrefs();
  const { base } = useInviteBase();
  const [sheet, setSheet] = useState<Sheet>(null);
  const current: Sheet = open ? (sheet ?? "menu") : null;
  const close = () => {
    setSheet(null);
    onClose();
  };
  const inRound = ["pick", "announce", "question", "answering", "investigation"].includes(view.phase);
  const inMatch = !!view.match && view.phase !== "final" && view.phase !== "lobby";
  const confirmThen = async (text: string, fn: () => Promise<unknown>, danger = true) => {
    close();
    if (await ask(text, danger)) await fn();
  };

  return (
    <>
      <Modal open={current === "menu"} onClose={close} title={t.menu.title}>
        <div className="space-y-1">
          <div className="flex items-center justify-between rounded-2xl px-3 py-2.5">
            <span className="flex items-center gap-3 font-medium text-white/85">
              <span className="w-6 text-center text-lg">🔊</span>
              {t.menu.sound}
            </span>
            <Toggle label={t.menu.sound} on={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
          </div>
          <div className="rounded-2xl px-3 py-2.5">
            <div className="mb-2 flex items-center gap-3 font-medium text-white/85">
              <span className="w-6 text-center text-lg">🌐</span>
              {t.menu.deviceLang}
            </div>
            <Choice
              value={prefs.roomLang}
              onChange={(roomLang) => setPrefs({ roomLang })}
              options={[
                { value: "auto", label: t.menu.auto },
                { value: "ar", label: "العربية" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
          <div className="my-2 h-px bg-white/[.07]" />
          <Item icon="🏆" onClick={() => setSheet("scores")}>
            {t.menu.scoreboard}
          </Item>
          <Item icon="📖" onClick={() => setSheet("how")}>
            {t.menu.howTo}
          </Item>
          <Item
            icon="🔗"
            onClick={async () => {
              const url = roomUrl(base, view.code);
              toast((await copyText(url)) ? t.common.copied : url, "good");
            }}
          >
            {t.menu.copyLink}
          </Item>
          <Item icon="📺" onClick={() => window.open(watchUrl(base, view.code), "_blank", "noopener")}>
            {t.menu.stream}
          </Item>
          {isHost && (
            <>
              <div className="my-2 h-px bg-white/[.07]" />
              <Item icon="⚙️" onClick={() => setSheet("settings")}>
                {t.menu.settings}
              </Item>
              {inRound && (
                <Item icon="⏹️" onClick={() => confirmThen(t.menu.cancelRoundConfirm, () => act({ type: "cancelRound" }))}>
                  {t.menu.cancelRound}
                </Item>
              )}
              {inMatch && (
                <Item icon="🏁" onClick={() => confirmThen(t.menu.endMatchConfirm, () => act({ type: "endMatch" }))}>
                  {t.menu.endMatch}
                </Item>
              )}
              {view.phase !== "lobby" && (
                <Item icon="🏠" onClick={() => confirmThen(t.menu.toLobbyConfirm, () => act({ type: "toLobby" }))}>
                  {t.menu.toLobby}
                </Item>
              )}
            </>
          )}
          <div className="my-2 h-px bg-white/[.07]" />
          <Item icon="🚪" danger onClick={() => confirmThen(t.menu.leaveConfirm, onLeave)}>
            {t.menu.leave}
          </Item>
        </div>
      </Modal>
      <Modal open={current === "settings"} onClose={close} title={`⚙️ ${t.settings.title}`}>
        <SettingsPanel />
      </Modal>
      <Modal open={current === "scores"} onClose={close} title={`🏆 ${t.scoreboard.title}`}>
        <Scoreboard />
      </Modal>
      <Modal open={current === "how"} onClose={close} title={t.how.title}>
        <HowToPlay />
      </Modal>
    </>
  );
}
