import { useSyncExternalStore } from "react";

export type Route = { name: "home" } | { name: "room"; code: string } | { name: "watch"; code: string };

function parse(path: string): Route {
  const m = path.match(/^\/(r|watch)\/(\d{5})\/?$/);
  if (m) return { name: m[1] === "r" ? "room" : "watch", code: m[2] };
  return { name: "home" };
}

let current: Route = parse(location.pathname);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

window.addEventListener("popstate", () => {
  current = parse(location.pathname);
  emit();
});

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  current = parse(path);
  emit();
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
