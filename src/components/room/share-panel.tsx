"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Smartphone } from "lucide-react";
import { QrCode } from "@/components/app/qr-code";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { api } from "@/lib/client/api";
import { loadSession } from "@/lib/client/session";
import { cn } from "@/lib/utils";

function useOrigin() {
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location is browser-only
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function SharePanel({ code, large }: { code: string; large?: boolean }) {
  const origin = useOrigin();
  const link = `${origin}/r/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <Panel className={cn("p-5", large && "lg:p-7")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-5", large && "sm:flex-nowrap")}>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Join at {origin.replace(/^https?:\/\//, "") || "this site"}</p>
          <p
            className={cn("mt-1 font-mono font-extrabold tracking-[0.18em] text-amber", large ? "text-5xl sm:text-6xl lg:text-7xl" : "text-4xl")}
            aria-label={`Room code: ${code.split("").join(" ")}`}
          >
            {code}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  if (navigator.share && /Mobi/.test(navigator.userAgent)) {
                    await navigator.share({ title: "Join my Game Night", url: link });
                  } else {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                } catch {}
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Link copied" : "Copy invite link"}
            </Button>
            <ContinueOnPhone code={code} origin={origin} />
          </div>
        </div>
        {origin && (
          <QrCode value={link} label={`QR code to join room ${code}`} className={large ? "w-40 sm:w-48 lg:w-56" : "w-28"} />
        )}
      </div>
    </Panel>
  );
}

/** One-time link so the host can take their private hand to a phone. */
export function ContinueOnPhone({ code, origin }: { code: string; origin: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      onOpenChange={async (open) => {
        if (!open) return;
        setLink(null);
        setError(null);
        const s = loadSession(code);
        if (!s) return;
        try {
          const { handoff } = await api.handoff(code, s.token);
          setLink(`${origin}/r/${code}?handoff=${handoff}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't create a link.");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Smartphone aria-hidden /> Play from my phone
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Continue on your phone</DialogTitle>
        <DialogDescription>
          Scan this private code to use your phone as your hand while this screen stays the table. It works once and expires in
          two minutes — don&apos;t show it to other players.
        </DialogDescription>
        <div className="mt-5 flex justify-center">
          {link ? (
            <QrCode value={link} label="Private QR code to continue on your phone" className="w-60" />
          ) : error ? (
            <p role="alert" className="text-rose">
              {error}
            </p>
          ) : (
            <div className="size-60 animate-pulse rounded-xl bg-surface-2" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
