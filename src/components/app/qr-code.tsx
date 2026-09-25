"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: 360, color: { dark: "#0b1020", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div className={cn("aspect-square rounded-xl bg-white p-2", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="size-full" />
      ) : (
        <div className="size-full animate-pulse rounded bg-slate-200" aria-label="Generating QR code" />
      )}
    </div>
  );
}
