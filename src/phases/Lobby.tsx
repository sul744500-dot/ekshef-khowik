import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MIN_PLAYERS } from "../../shared/constants";
import { Avatar } from "../components/Avatar";
import { AvatarPicker, NameInput } from "../components/ProfileForm";
import { QR } from "../components/QR";
import { Button, Modal, Panel, cn } from "../components/ui";
import { useT } from "../lib/lang";
import { saveLastProfile } from "../lib/session";
import { canShare, copyText, roomUrl, shareLink, useInviteBase, watchUrl } from "../lib/share";
import { toast } from "../lib/toast";
import { SettingsPanel } from "./SettingsPanel";
import { useGame } from "./context";

function InviteCard() {
  const { t } = useT();
  const { view } = useGame();
  const { base, isLan } = useInviteBase();
  const url = roomUrl(base, view.code);
  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="relative flex items-center gap-5">
        <QR value={url} className="size-28 shrink-0 sm:size-36" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white/50">{t.lobby.invite}</div>
          <div dir="ltr" className="mt-1 font-display text-5xl tracking-[.18em] text-white sm:text-6xl">
            {view.code}
          </div>
          <div dir="ltr" className="mt-1 truncate text-xs text-white/40">
            {url.replace(/^https?:\/\//, "")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => toast((await copyText(url)) ? t.common.copied : url, "good")}
            >
              🔗 {t.lobby.copyLink}
            </Button>
            {canShare() && (
              <Button size="sm" variant="secondary" onClick={() => void shareLink(url, t.appName, t.tagline)}>
                📤 {t.common.share}
              </Button>
            )}
            <a
              href={watchUrl(base, view.code)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[.07] px-3 text-sm font-semibold text-white/90 hover:bg-white/[.12]"
            >
              📺 {t.lobby.stream}
            </a>
          </div>
        </div>
      </div>
      {isLan && <p className="relative mt-3 text-xs leading-relaxed text-amber-200/70">📶 {t.lobby.lanHint}</p>}
    </Panel>
  );
}

function EditProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { me, act, view } = useGame();
  const [name, setName] = useState(me?.name ?? "");
  const [avatar, setAvatar] = useState(me?.avatar ?? "");
  const save = async () => {
    const r = await act({ type: "profile", name, avatar });
    if (r.ok) {
      saveLastProfile({ name: name.trim(), avatar });
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t.lobby.editProfile}>
      <div className="space-y-4">
        <div className="flex justify-center">
          <Avatar person={{ avatar, color: me?.color ?? 0 }} size="xl" />
        </div>
        <NameInput value={name} onChange={setName} onEnter={save} />
        <AvatarPicker value={avatar} onChange={setAvatar} taken={view.players.map((p) => p.avatar)} />
        <Button block size="lg" onClick={save} disabled={!name.trim()}>
          {t.lobby.save}
        </Button>
      </div>
    </Modal>
  );
}

export function Lobby() {
  const { t } = useT();
  const { view, me, isHost, act, hostName } = useGame();
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const connected = view.players.filter((p) => p.connected).length;
  const need = Math.max(0, MIN_PLAYERS - connected);

  return (
    <div className="pb-28">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <InviteCard />
          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-white">{t.lobby.title}</h2>
              <span className="rounded-full bg-white/[.07] px-3 py-1 text-sm font-semibold text-white/70 tabular-nums">
                {t.lobby.count(view.players.length, view.settings.maxPlayers)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              <AnimatePresence>
                {view.players.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.6, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: "spring", damping: 18, stiffness: 260 }}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-2xl bg-white/[.04] px-2 py-3 text-center",
                      p.id === me?.id && "bg-violet-500/15 ring-1 ring-violet-400/40",
                    )}
                  >
                    {p.isHost && <span className="absolute -top-2 start-2 text-lg drop-shadow">👑</span>}
                    <Avatar person={p} size="lg" offline={!p.connected} />
                    <div className="w-full truncate text-sm font-semibold text-white/90">{p.name}</div>
                    {p.id === me?.id ? (
                      <span className="text-[11px] text-violet-300">{t.common.you}</span>
                    ) : !p.connected ? (
                      <span className="text-[11px] text-white/40">{t.common.offline}</span>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
              {Array.from({ length: Math.max(0, MIN_PLAYERS - view.players.length) }, (_, i) => (
                <div key={`empty-${i}`} className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/12 px-2 py-3">
                  <span className="grid size-16 place-items-center rounded-full bg-white/[.03] text-2xl text-white/20">?</span>
                  <span className="h-5" />
                </div>
              ))}
            </div>
            {me && (
              <button onClick={() => setEditing(true)} className="mt-4 text-sm font-medium text-violet-300 hover:text-violet-200">
                ✏️ {t.lobby.editProfile}
              </button>
            )}
          </Panel>
        </div>
        <Panel className="h-fit p-5">
          <h3 className="mb-1 font-display text-xl text-white/90">⚙️ {t.settings.title}</h3>
          <SettingsPanel />
        </Panel>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-night-950 via-night-950/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <div className="mx-auto max-w-md text-center">
          {isHost ? (
            <>
              <Button
                block
                size="xl"
                disabled={need > 0}
                busy={starting}
                onClick={async () => {
                  setStarting(true);
                  await act({ type: "start" });
                  setStarting(false);
                }}
                className={cn(need === 0 && "animate-glow")}
              >
                🚀 {t.lobby.start}
              </Button>
              {need > 0 && <p className="mt-2 text-sm text-white/55">{t.lobby.needMore(need)}</p>}
            </>
          ) : (
            <div className="glass-strong inline-flex items-center gap-3 rounded-full px-5 py-3 text-white/75">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-violet-400" />
              </span>
              {t.lobby.waitingHost(hostName)}
            </div>
          )}
        </div>
      </div>
      {editing && <EditProfile open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}
