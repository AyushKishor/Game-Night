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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The address to share. If this screen was opened as http://localhost, phones
 * can't reach it, so we ask the server for this computer's Wi-Fi address.
 */
function useOrigin() {
  const [origin, setOrigin] = useState("");
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    const loc = window.location;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location is browser-only
    setOrigin(loc.origin);
    if (!LOCAL_HOSTS.has(loc.hostname)) return;
    let alive = true;
    fetch("/api/network")
      .then((r) => r.json())
      .then((d: { addresses?: string[] }) => {
        if (!alive) return;
        const ip = d.addresses?.[0];
        if (ip) setOrigin(`${loc.protocol}//${ip}${loc.port ? `:${loc.port}` : ""}`);
        else setUnreachable(true);
      })
      .catch(() => alive && setUnreachable(true));
    return () => {
      alive = false;
    };
  }, []);
  return { origin, unreachable };
}

export function SharePanel({ code, large }: { code: string; large?: boolean }) {
  const { origin, unreachable } = useOrigin();
  const link = `${origin}/r/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <Panel className={cn("p-5", large && "lg:p-7")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-5", large && "sm:flex-nowrap")}>
        <div>
          <p className="text-muted text-sm font-bold tracking-wider uppercase">
            Join at {origin.replace(/^https?:\/\//, "") || "this site"}
          </p>
          <p
            className={cn(
              "text-amber mt-1 font-mono font-extrabold tracking-[0.18em]",
              large ? "text-5xl sm:text-6xl lg:text-7xl" : "text-4xl",
            )}
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
          {/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin.replace(/^https?:\/\//, "")) && (
            <p className="text-muted mt-2 text-xs">
              Phones must be on the same Wi-Fi. Can&apos;t connect? On the computer, run <code>npm run party:online</code> for a
              link that works anywhere.
            </p>
          )}
          {unreachable && (
            <p className="text-amber mt-2 text-sm" role="note">
              Phones can&apos;t open “localhost”. Connect this computer to Wi-Fi and reload, or open this page using the
              computer&apos;s network address.
            </p>
          )}
          <div className="hidden"></div>
        </div>
        {origin && (
          <QrCode
            value={link}
            label={`QR code to join room ${code}`}
            className={cn("shrink-0", large ? "w-40 sm:w-48 lg:w-56" : "w-28")}
          />
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
            <div className="bg-surface-2 size-60 animate-pulse rounded-xl" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
