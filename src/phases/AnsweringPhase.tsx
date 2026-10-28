import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { LIMITS } from "../../shared/constants";
import { Avatar } from "../components/Avatar";
import { TimerBar } from "../components/TimerBar";
import { Button, Panel, ask, cn } from "../components/ui";
import { useT } from "../lib/lang";
import { getDraft, saveDraft } from "../lib/session";
import { play } from "../lib/sound";
import { QuestionCard, RoleChips, RoleHint } from "./common";
import { useGame } from "./context";

function Progress() {
  const { t } = useT();
  const { view, show, player } = useGame();
  const r = view.round!;
  const done = r.answeredIds.length;
  const total = Math.max(r.participantIds.length, done);
  const ids = [...new Set([...r.participantIds, ...r.answeredIds])];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm font-semibold text-white/70">{t.answering.progress(done, total)}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {ids.map((id) => {
          const p = player(id);
          const answered = r.answeredIds.includes(id);
          return (
            <motion.div
              key={id}
              animate={answered ? { scale: [1, 1.25, 1] } : {}}
              className={cn("relative rounded-full transition", !answered && "opacity-45")}
            >
              <Avatar person={show(p)} size="sm" offline={p && !p.connected} />
              {answered && (
                <span className="absolute -bottom-1 -end-1 grid size-5 place-items-center rounded-full bg-emerald-500 text-[11px] font-bold text-white ring-2 ring-night-900">
                  ✓
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-linear-to-l from-emerald-400 to-teal-400" animate={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function AnswerBox() {
  const { t } = useT();
  const { view, act, me } = useGame();
  const r = view.round!;
  const draftKey = `${view.code}:${view.match?.seq}:a`;
  const [text, setText] = useState(() => getDraft(draftKey));
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(!view.settings.streamerMode);
  useEffect(() => saveDraft(draftKey, text), [draftKey, text]);

  if (r.myAnswer !== null) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center">
        <div className="font-display text-2xl text-emerald-300">{t.answering.sent}</div>
        <div className="mt-3 text-xs font-semibold text-white/50">{t.answering.mine}</div>
        <button onClick={() => setPeek((p) => !p)} className={cn("mt-1 text-lg font-semibold text-white transition", !peek && "blur-md select-none")}>
          {r.myAnswer}
        </button>
        {!peek && <div className="mt-1 text-xs text-white/40">{t.answering.tapToShow}</div>}
        <p className="mt-4 text-sm text-white/55">{t.answering.waitOthers}</p>
      </motion.div>
    );
  }

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await act({ type: "answer", text });
    setBusy(false);
    if (res.ok) {
      saveDraft(draftKey, "");
      play("send");
    }
  };

  return (
    <Panel className="p-5">
      <label className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
        <Avatar person={me} size="xs" /> {t.answering.yourAnswer}
      </label>
      <div className="relative">
        <textarea
          value={text}
          autoFocus
          maxLength={LIMITS.answer}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={t.answering.placeholder}
          className="field min-h-28 w-full resize-none rounded-3xl p-4 text-lg leading-relaxed font-semibold"
        />
        <span className="absolute bottom-3 end-4 text-xs text-white/35 tabular-nums">
          {Array.from(text).length}/{LIMITS.answer}
        </span>
      </div>
      <Button block size="lg" className="mt-4" disabled={!text.trim()} busy={busy} onClick={send}>
        🔒 {t.answering.send}
      </Button>
      <p className="mt-2 text-center text-xs text-white/40">⚠️ {t.answering.noEdit}</p>
    </Panel>
  );
}

export function AnsweringPhase({ big }: { big?: boolean }) {
  const { t } = useT();
  const { view, me, isInvestigator, isHost, act, watch } = useGame();
  const r = view.round!;
  const targetAnswered = !!r.target && r.answeredIds.includes(r.target.id);
  const pending = r.participantIds.filter((id) => !r.answeredIds.includes(id)).length;
  const canForce = isHost && !watch && pending > 0 && targetAnswered && r.answeredIds.length >= 2;
  const canAnswer = !watch && !!me && !isInvestigator;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <QuestionCard text={r.question ?? ""} big={big || !canAnswer} auto={r.autoQuestion} />
      <RoleChips />
      <TimerBar deadline={view.deadline} total={view.settings.answerTime} audible={canAnswer && r.myAnswer === null} />
      {canAnswer ? (
        <>
          <AnswerBox />
          {r.myAnswer === null && <RoleHint />}
        </>
      ) : (
        !watch && <p className="text-center text-white/65">{t.answering.investigatorWait}</p>
      )}
      <Progress />
      {canForce && (
        <div className="text-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              if (await ask(t.answering.forceConfirm)) await act({ type: "forceInvestigation" });
            }}
          >
            ⏭️ {t.answering.force}
          </Button>
        </div>
      )}
    </div>
  );
}
