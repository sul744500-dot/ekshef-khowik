import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { LIMITS, MIN_QUESTION_LENGTH } from "../../shared/constants";
import { QUESTION_BANK } from "../../shared/questions";
import { TimerBar } from "../components/TimerBar";
import { Button, Panel } from "../components/ui";
import { useT } from "../lib/lang";
import { getDraft, saveDraft } from "../lib/session";
import { play } from "../lib/sound";
import { RoleChips, RoleHint, WaitingLine } from "./common";
import { useGame } from "./context";

function pickSuggestions(bank: readonly string[], n: number): string[] {
  const idx = new Set<number>();
  while (idx.size < Math.min(n, bank.length)) idx.add(Math.floor(Math.random() * bank.length));
  return [...idx].map((i) => bank[i]);
}

function QuestionWriter() {
  const { t, lang } = useT();
  const { view, act } = useGame();
  const draftKey = `${view.code}:${view.match?.seq}:q`;
  const [text, setText] = useState(() => getDraft(draftKey));
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(0);
  const suggestions = useMemo(() => pickSuggestions(QUESTION_BANK[lang], 3), [lang, seed]);
  useEffect(() => saveDraft(draftKey, text), [draftKey, text]);
  const valid = Array.from(text.trim()).length >= MIN_QUESTION_LENGTH;

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const r = await act({ type: "question", text });
    setBusy(false);
    if (r.ok) {
      saveDraft(draftKey, "");
      play("send");
    }
  };

  return (
    <Panel className="mx-auto max-w-3xl p-5 sm:p-7">
      <h2 className="text-center font-display text-3xl text-white sm:text-4xl">✍️ {t.question.title}</h2>
      <RoleChips className="mt-3" />
      <TimerBar className="mt-4" deadline={view.deadline} total={view.settings.questionTime} audible />
      <div className="relative mt-5">
        <textarea
          value={text}
          autoFocus
          maxLength={LIMITS.question}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={t.question.placeholder}
          className="field min-h-32 w-full resize-none rounded-3xl p-5 text-xl leading-relaxed font-semibold sm:text-2xl"
        />
        <span className="absolute bottom-3 end-4 text-xs text-white/35 tabular-nums">
          {Array.from(text).length}/{LIMITS.question}
        </span>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/60">💡 {t.question.suggestions}</span>
          <button onClick={() => setSeed((s) => s + 1)} className="text-sm font-medium text-violet-300 hover:text-violet-200">
            🎲 {t.question.another}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {suggestions.map((q, i) => (
            <motion.button
              key={`${seed}-${i}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
              onClick={() => {
                play("tap");
                setText(q);
              }}
              className="rounded-2xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-start text-sm text-white/80 transition hover:border-violet-400/40 hover:bg-violet-500/10"
            >
              {q}
            </motion.button>
          ))}
        </div>
      </div>
      <Button block size="xl" className="mt-5" disabled={!valid} busy={busy} onClick={send}>
        📨 {t.question.send}
      </Button>
      <p className="mt-3 text-center text-xs text-white/40">{t.question.tip}</p>
    </Panel>
  );
}

export function QuestionPhase() {
  const { t } = useT();
  const { view, isInvestigator, watch, show, masked } = useGame();
  const r = view.round!;
  if (isInvestigator && !watch) return <QuestionWriter />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <RoleChips />
      <WaitingLine text={t.question.waiting(show(r.investigator).name)} person={show(r.investigator)} masked={masked} />
      <TimerBar deadline={view.deadline} total={view.settings.questionTime} />
      {!watch && <RoleHint />}
    </div>
  );
}
