import { useT } from "../lib/lang";
import { POINTS } from "../../shared/constants";

export function HowToPlay() {
  const { t } = useT();
  return (
    <ol className="space-y-3">
      {t.how.steps.map(([icon, title, body], i) => (
        <li key={i} className="flex gap-3 rounded-2xl bg-white/[.04] p-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-violet-500/30 to-sky-500/20 text-2xl">{icon}</span>
          <div>
            <div className="font-semibold text-white">{title}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-white/65">{body}</p>
          </div>
        </li>
      ))}
      <li className="flex flex-wrap justify-center gap-2 pt-1 text-xs font-semibold">
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">🕵️ +{POINTS.found}</span>
        <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300">🎯 +{POINTS.escaped}</span>
        <span className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-fuchsia-300">🎭 +{POINTS.fooled}</span>
      </li>
    </ol>
  );
}
