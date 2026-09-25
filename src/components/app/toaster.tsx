"use client";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useRoomStore } from "@/lib/client/room-store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toast = useRoomStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useRoomStore.setState({ toast: null }), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const Icon = toast?.tone === "success" ? CheckCircle2 : toast?.tone === "info" ? Info : AlertCircle;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-3" aria-live="assertive">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            role="alert"
            className={cn(
              "pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-soft",
              toast.tone === "error" && "border-rose/60 bg-[#2a1220] text-text",
              toast.tone === "success" && "border-mint/60 bg-[#0f2a22] text-text",
              toast.tone === "info" && "border-sky/60 bg-[#0f2230] text-text",
            )}
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", toast.tone === "error" ? "text-rose" : toast.tone === "success" ? "text-mint" : "text-sky")} aria-hidden />
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              className="-m-1 rounded p-1 text-muted hover:text-text"
              onClick={() => useRoomStore.setState({ toast: null })}
              aria-label="Dismiss message"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
