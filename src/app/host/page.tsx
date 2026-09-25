import type { Metadata } from "next";
import { Brand } from "@/components/app/brand";
import { HostForm } from "@/components/app/host-form";

export const metadata: Metadata = { title: "Host a game" };

export default function HostPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Brand />
      <div className="mt-10 rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">Host a game</h1>
        <p className="mt-1 text-muted">
          You&apos;ll get a room code and QR code to share. Keep this screen where everyone can see it.
        </p>
        <HostForm />
      </div>
    </main>
  );
}
