import { useEffect, useState } from "react";

const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

let lanBase: Promise<string | null> | null = null;

/** إذا فُتحت اللعبة على localhost نستبدله بعنوان الجهاز على الشبكة، ليفتح الرابط من جوالات الأصحاب */
function fetchLanBase(): Promise<string | null> {
  lanBase ??= fetch("/lan-info", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ addresses: string[]; port: number }>) : null))
    .then((info) => (info?.addresses[0] ? `${location.protocol}//${info.addresses[0]}:${location.port || info.port}` : null))
    .catch(() => null);
  return lanBase;
}

export function useInviteBase(): { base: string; isLan: boolean } {
  const [base, setBase] = useState(() => location.origin);
  const [isLan, setIsLan] = useState(false);
  useEffect(() => {
    if (!isLocalHost(location.hostname)) return;
    let alive = true;
    void fetchLanBase().then((b) => {
      if (alive && b) {
        setBase(b);
        setIsLan(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { base, isLan: isLan || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) };
}

export const roomUrl = (base: string, code: string) => `${base}/r/${code}`;
export const watchUrl = (base: string, code: string) => `${base}/watch/${code}`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // متصفحات بدون صلاحية الحافظة (http على الشبكة المحلية): الطريقة القديمة
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export async function shareLink(url: string, title: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ url, title, text });
    return true;
  } catch {
    return false;
  }
}
