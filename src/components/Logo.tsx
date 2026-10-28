import { useT } from "../lib/lang";
import { cn } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.55" stopColor="#818cf8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M40.5 40.5 L56 56" stroke="url(#lm-g)" strokeWidth="8.5" strokeLinecap="round" />
      <circle cx="27" cy="27" r="17.5" fill="rgba(124,58,237,.22)" stroke="url(#lm-g)" strokeWidth="6" />
      <path d="M15 27 Q27 15.5 39 27 Q27 38.5 15 27Z" fill="#fff" />
      <circle cx="27" cy="27" r="5" fill="#1e1b4b" />
      <circle cx="28.8" cy="25.2" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { t, lang } = useT();
  const big = size === "lg";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark className={cn("shrink-0 drop-shadow-[0_6px_18px_rgba(124,58,237,.6)]", big ? "size-16 sm:size-20" : size === "md" ? "size-11" : "size-8")} />
      <div className="leading-none">
        <div className={cn("font-display text-gradient", big ? "text-5xl sm:text-6xl" : size === "md" ? "text-3xl" : "text-2xl")}>{t.appName}</div>
        {size !== "sm" && (
          <div className={cn("mt-1.5 font-semibold tracking-[.25em] text-white/45", big ? "text-xs sm:text-sm" : "text-[10px]", lang === "en" && "tracking-normal")}>
            {t.appNameAlt}
          </div>
        )}
      </div>
    </div>
  );
}
