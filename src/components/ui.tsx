import { AnimatePresence, motion } from "motion/react";
import { useEffect, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useT } from "../lib/lang";
import { play } from "../lib/sound";

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "gold";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-linear-to-l from-violet-600 via-indigo-600 to-sky-500 shadow-[0_12px_32px_-12px_rgba(124,58,237,.9)] hover:brightness-110",
  secondary: "text-white/90 bg-white/[.07] border border-white/12 hover:bg-white/[.12]",
  ghost: "text-white/70 hover:text-white hover:bg-white/[.07]",
  danger: "text-white bg-linear-to-l from-rose-600 to-red-500 shadow-[0_12px_32px_-12px_rgba(244,63,94,.9)] hover:brightness-110",
  success: "text-white bg-linear-to-l from-emerald-600 to-teal-500 shadow-[0_12px_32px_-12px_rgba(16,185,129,.8)] hover:brightness-110",
  gold: "text-night-950 bg-linear-to-l from-amber-300 via-yellow-300 to-orange-300 shadow-[0_12px_36px_-10px_rgba(251,191,36,.9)] hover:brightness-105",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-base rounded-2xl gap-2",
  lg: "h-14 px-7 text-lg rounded-2xl gap-2.5",
  xl: "h-16 px-8 text-xl rounded-3xl gap-3",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  busy?: boolean;
  silent?: boolean;
}

export function Button({ variant = "primary", size = "md", block, busy, silent, className, children, onClick, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      onClick={(e) => {
        if (!silent) play("tap");
        onClick?.(e);
      }}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-semibold transition duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass rounded-3xl", className)}>{children}</div>;
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        play("tap");
        onChange(!on);
      }}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-linear-to-l from-violet-500 to-sky-500" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
          on ? "start-6" : "start-1",
        )}
      />
    </button>
  );
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (o.value === value) return;
            play("tap");
            onChange(o.value);
          }}
          className={cn(
            "h-9 rounded-xl px-3 text-sm font-medium transition disabled:cursor-not-allowed",
            o.value === value
              ? "bg-linear-to-l from-violet-600 to-indigo-500 text-white shadow-[0_6px_18px_-8px_rgba(124,58,237,.9)]"
              : "bg-white/[.06] text-white/70 hover:bg-white/[.1] disabled:hover:bg-white/[.06]",
            disabled && o.value !== value && "opacity-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-night-950/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "glass-strong relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl text-white">{title}</h2>
              <button
                onClick={onClose}
                aria-label={t.common.close}
                className="grid size-9 place-items-center rounded-xl bg-white/[.07] text-white/70 hover:bg-white/[.12] hover:text-white"
              >
                ✕
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- نافذة تأكيد عامة ----------

interface Ask {
  text: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let pending: Ask | null = null;
const askListeners = new Set<() => void>();

export function ask(text: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { text, danger, resolve };
    askListeners.forEach((l) => l());
  });
}

export function ConfirmHost() {
  const { t } = useT();
  const current = useSyncExternalStore(
    (cb) => {
      askListeners.add(cb);
      return () => askListeners.delete(cb);
    },
    () => pending,
  );
  const close = (ok: boolean) => {
    current?.resolve(ok);
    pending = null;
    askListeners.forEach((l) => l());
  };
  return (
    <Modal open={!!current} onClose={() => close(false)} title={t.common.sure}>
      <p className="mb-6 text-lg leading-relaxed text-white/85">{current?.text}</p>
      <div className="flex gap-3">
        <Button block variant={current?.danger ? "danger" : "primary"} onClick={() => close(true)}>
          {t.common.confirm}
        </Button>
        <Button block variant="secondary" onClick={() => close(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </Modal>
  );
}
