import type { PersonRef } from "../../shared/types";
import { cn } from "./ui";

export const HUES = ["#a78bfa", "#60a5fa", "#22d3ee", "#2dd4bf", "#4ade80", "#a3e635", "#facc15", "#fb923c", "#f87171", "#f472b6", "#e879f9", "#818cf8"];

export const hue = (i: number | undefined) => HUES[(i ?? 0) % HUES.length];

const SIZES = {
  xs: "size-7 text-sm",
  sm: "size-9 text-lg",
  md: "size-12 text-2xl",
  lg: "size-16 text-3xl",
  xl: "size-24 text-5xl",
  "2xl": "size-32 text-6xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

export function Avatar({
  person,
  size = "md",
  masked,
  offline,
  className,
}: {
  person: Pick<PersonRef, "avatar" | "color"> | null | undefined;
  size?: AvatarSize;
  masked?: boolean;
  offline?: boolean;
  className?: string;
}) {
  const color = masked || !person ? "#64748b" : hue(person.color);
  return (
    <span
      className={cn("relative inline-grid shrink-0 select-none place-items-center rounded-full", SIZES[size], offline && "opacity-45 grayscale", className)}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${color}55, ${color}18 60%, transparent 75%), rgba(255,255,255,.04)`,
        boxShadow: `inset 0 0 0 2px ${color}aa, 0 6px 20px -8px ${color}`,
      }}
    >
      <span className="leading-none">{masked || !person ? "👤" : person.avatar}</span>
    </span>
  );
}
