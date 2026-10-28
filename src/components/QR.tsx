import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "./ui";

export function QR({ value, className }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#0b0820", light: "#ffffff" } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-white p-2 shadow-[0_10px_40px_-12px_rgba(124,58,237,.8)]", className)}>
      {src ? <img src={src} alt="QR" className="block size-full" /> : <div className="size-full animate-pulse bg-slate-200" />}
    </div>
  );
}
