import type { ReactNode } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, TIME_CHOICES } from "../../shared/constants";
import type { Settings } from "../../shared/types";
import { Choice, Toggle, cn } from "../components/ui";
import { useT } from "../lib/lang";
import { useGame } from "./context";

type RoundKey = `c${number}` | `f${number}` | "e";

const ROUND_PRESETS: RoundKey[] = ["c1", "c2", "c3", "f3", "f5", "f10", "f15", "f20", "e"];

const roundKey = (s: Settings): RoundKey => (s.roundMode === "endless" ? "e" : s.roundMode === "cycles" ? `c${s.roundCount}` : `f${s.roundCount}`);

function Row({ label, hint, children, inline }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={cn("py-3", inline && "flex items-center justify-between gap-4")}>
      <div className={cn(!inline && "mb-2")}>
        <div className="text-sm font-semibold text-white/85">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-relaxed text-white/45">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel() {
  const { t } = useT();
  const { view, isHost, act } = useGame();
  const s = view.settings;
  const set = (patch: Partial<Settings>) => void act({ type: "settings", patch });
  const disabled = !isHost;
  const timeOptions = (values: readonly number[]) => values.map((v) => ({ value: v, label: v === 0 ? t.common.open : t.common.seconds(v) }));
  const rounds = ROUND_PRESETS.includes(roundKey(s)) ? ROUND_PRESETS : [...ROUND_PRESETS, roundKey(s)];
  const minPlayers = Math.max(MIN_PLAYERS, view.players.length);

  return (
    <div className="divide-y divide-white/[.07]">
      {!isHost && <p className="pb-3 text-xs text-white/50">🔒 {t.settings.hostOnly}</p>}

      <Row label={t.settings.language}>
        <Choice
          disabled={disabled}
          value={s.language}
          onChange={(language) => set({ language })}
          options={[
            { value: "ar", label: t.settings.langAr },
            { value: "en", label: t.settings.langEn },
          ]}
        />
      </Row>

      <Row label={t.settings.rounds}>
        <Choice
          disabled={disabled}
          value={roundKey(s)}
          onChange={(key) => {
            if (key === "e") set({ roundMode: "endless" });
            else set({ roundMode: key[0] === "c" ? "cycles" : "fixed", roundCount: Number(key.slice(1)) });
          }}
          options={rounds.map((key) => ({
            value: key,
            label: key === "e" ? t.settings.endless : key[0] === "c" ? t.settings.cycles(Number(key.slice(1))) : t.settings.fixed(Number(key.slice(1))),
          }))}
        />
      </Row>

      <Row label={t.settings.targetMode} hint={s.targetMode === "manual" ? t.settings.manualHint : undefined}>
        <Choice
          disabled={disabled}
          value={s.targetMode}
          onChange={(targetMode) => set({ targetMode })}
          options={[
            { value: "random", label: `🎲 ${t.settings.random}` },
            { value: "manual", label: `👆 ${t.settings.manual}` },
          ]}
        />
      </Row>

      <Row label={t.settings.questionTime}>
        <Choice disabled={disabled} value={s.questionTime} onChange={(questionTime) => set({ questionTime })} options={timeOptions(TIME_CHOICES.questionTime)} />
      </Row>
      <Row label={t.settings.answerTime}>
        <Choice disabled={disabled} value={s.answerTime} onChange={(answerTime) => set({ answerTime })} options={timeOptions(TIME_CHOICES.answerTime)} />
      </Row>
      <Row label={t.settings.decisionTime}>
        <Choice disabled={disabled} value={s.decisionTime} onChange={(decisionTime) => set({ decisionTime })} options={timeOptions(TIME_CHOICES.decisionTime)} />
      </Row>

      <Row label={t.settings.maxPlayers} inline>
        <div className="flex items-center gap-2">
          <button
            disabled={disabled || s.maxPlayers <= minPlayers}
            onClick={() => set({ maxPlayers: s.maxPlayers - 1 })}
            className="grid size-9 place-items-center rounded-xl bg-white/[.07] text-lg text-white/80 hover:bg-white/[.12] disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center font-display text-2xl text-white tabular-nums">{s.maxPlayers}</span>
          <button
            disabled={disabled || s.maxPlayers >= MAX_PLAYERS}
            onClick={() => set({ maxPlayers: s.maxPlayers + 1 })}
            className="grid size-9 place-items-center rounded-xl bg-white/[.07] text-lg text-white/80 hover:bg-white/[.12] disabled:opacity-30"
          >
            +
          </button>
        </div>
      </Row>

      <Row label={t.settings.scoring} inline>
        <Toggle label={t.settings.scoring} disabled={disabled} on={s.scoring} onChange={(scoring) => set({ scoring })} />
      </Row>
      <Row label={t.settings.sounds} inline>
        <Toggle label={t.settings.sounds} disabled={disabled} on={s.sounds} onChange={(sounds) => set({ sounds })} />
      </Row>
      <Row label={`📺 ${t.settings.streamerMode}`} hint={t.settings.streamerHint} inline>
        <Toggle label={t.settings.streamerMode} disabled={disabled} on={s.streamerMode} onChange={(streamerMode) => set({ streamerMode })} />
      </Row>
      <Row label={`🔒 ${t.settings.locked}`} hint={t.settings.lockedHint} inline>
        <Toggle label={t.settings.locked} disabled={disabled} on={s.locked} onChange={(locked) => set({ locked })} />
      </Row>
    </div>
  );
}
