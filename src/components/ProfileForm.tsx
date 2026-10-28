import { AVATARS, LIMITS } from "../../shared/constants";
import { useT } from "../lib/lang";
import { play } from "../lib/sound";
import { cn } from "./ui";

export function NameInput({ value, onChange, onEnter, autoFocus }: { value: string; onChange: (v: string) => void; onEnter?: () => void; autoFocus?: boolean }) {
  const { t } = useT();
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      maxLength={LIMITS.name}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={t.home.namePlaceholder}
      autoComplete="nickname"
      enterKeyHint="go"
      className="field h-14 w-full rounded-2xl px-4 text-lg font-semibold"
    />
  );
}

export function AvatarPicker({ value, onChange, taken = [] }: { value: string; onChange: (v: string) => void; taken?: string[] }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {AVATARS.map((a) => {
        const used = taken.includes(a) && a !== value;
        return (
          <button
            key={a}
            type="button"
            onClick={() => {
              play("tap");
              onChange(a);
            }}
            className={cn(
              "grid aspect-square place-items-center rounded-xl text-2xl transition",
              a === value ? "scale-110 bg-violet-500/30 ring-2 ring-violet-300" : "bg-white/[.05] hover:bg-white/[.1]",
              used && "opacity-35",
            )}
            aria-pressed={a === value}
          >
            {a}
          </button>
        );
      })}
    </div>
  );
}
