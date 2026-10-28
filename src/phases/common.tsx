import { motion } from "motion/react";
import type { PersonRef } from "../../shared/types";
import { Avatar } from "../components/Avatar";
import { cn } from "../components/ui";
import { useT } from "../lib/lang";
import { useGame } from "./context";

export function PersonChip({ label, person, masked, tone }: { label: string; person: PersonRef; masked?: boolean; tone: "violet" | "rose" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border py-1 ps-1 pe-3",
        tone === "violet" ? "border-violet-400/30 bg-violet-500/10" : "border-rose-400/30 bg-rose-500/10",
      )}
    >
      <Avatar person={person} masked={masked} size="xs" />
      <span className="text-xs text-white/55">{label}</span>
      <span className="max-w-32 truncate text-sm font-bold text-white">{person.name}</span>
    </div>
  );
}

/** المحقق والشخص المطلوب. المحقق يرى اسم المطلوب دائمًا حتى في وضع البث */
export function RoleChips({ className }: { className?: string }) {
  const { t } = useT();
  const { view, show, masked, isInvestigator } = useGame();
  const r = view.round;
  if (!r) return null;
  const target = isInvestigator ? r.target : show(r.target);
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      <PersonChip label={`🕵️ ${t.roles.investigator}`} person={show(r.investigator)} masked={masked} tone="violet" />
      {r.target && target && <PersonChip label={`🎯 ${t.roles.target}`} person={target} masked={masked && !isInvestigator} tone="rose" />}
    </div>
  );
}

/** تلميح الدور للاعب الحالي */
export function RoleHint({ className }: { className?: string }) {
  const { t } = useT();
  const { view, me, isInvestigator, isTarget } = useGame();
  const r = view.round;
  if (!r || !me) return null;
  const target = r.target?.name ?? "؟";
  let title: string | null = null;
  let body: string;
  let tone = "from-fuchsia-500/20 to-violet-500/10 border-fuchsia-400/25";
  if (isInvestigator) {
    title = t.roles.youInvestigator;
    body = t.roles.investigatorHint(target);
    tone = "from-violet-500/25 to-sky-500/10 border-violet-400/30";
  } else if (isTarget) {
    title = t.roles.youTarget;
    body = t.roles.targetHint(r.investigator.name);
    tone = "from-rose-500/25 to-orange-500/10 border-rose-400/30";
  } else if (me.role === "spectator") {
    body = t.roles.spectatorHint;
  } else {
    body = t.roles.answererHint(target, r.investigator.name);
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl border bg-linear-to-l p-4 text-center", tone, className)}
    >
      {title && <div className="font-display text-2xl text-white">{title}</div>}
      <p className={cn("text-sm leading-relaxed text-white/80", title && "mt-1")}>{body}</p>
    </motion.div>
  );
}

export function QuestionCard({ text, big, auto }: { text: string; big?: boolean; auto?: boolean }) {
  const { t } = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 220 }}
      className="question-card relative overflow-hidden rounded-3xl p-5 text-center sm:p-7"
    >
      <div className="text-xs font-bold tracking-wide text-violet-200/70">❝ {t.answering.question} ❞</div>
      <p className={cn("mt-2 font-bold leading-snug text-white text-balance", big ? "text-3xl sm:text-4xl lg:text-5xl" : "text-xl sm:text-2xl")}>{text}</p>
      {auto && <div className="mt-2 text-xs text-amber-200/70">⏰ {t.answering.auto}</div>}
    </motion.div>
  );
}

export function WaitingLine({ text, person, masked }: { text: string; person?: PersonRef; masked?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      {person && (
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/25" />
          <Avatar person={person} masked={masked} size="xl" />
        </div>
      )}
      <p className="flex items-center gap-2 text-lg font-semibold text-white/80">
        {text}
        <span className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-violet-300" />
        </span>
      </p>
    </div>
  );
}
