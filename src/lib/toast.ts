import { useSyncExternalStore } from "react";

export type ToastKind = "info" | "good" | "bad";
export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: ToastKind = "info", ms = 2800) {
  const id = nextId++;
  toasts = [...toasts.filter((t) => t.text !== text), { id, text, kind }].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}
