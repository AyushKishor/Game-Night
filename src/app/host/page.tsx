import type { Metadata } from "next";
import { Brand } from "@/components/app/brand";
import { HostForm } from "@/components/app/host-form";

export const metadata: Metadata = { title: "Host a game" };

export default function HostPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Brand />
      <div className="border-border bg-surface shadow-soft mt-10 rounded-3xl border p-6 sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">Host a game</h1>
        <p className="text-muted mt-1">
          You&apos;ll get a room code and QR code to share. Keep this screen where everyone can see it.
        </p>
        <HostForm />
      </div>
    </main>
  );
}
