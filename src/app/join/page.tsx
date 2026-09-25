import { Suspense } from "react";
import type { Metadata } from "next";
import { Brand } from "@/components/app/brand";
import { JoinFlow } from "@/components/app/join-flow";

export const metadata: Metadata = { title: "Join a game" };

export default function JoinPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Brand />
      <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-3xl bg-surface" />}>
        <JoinFlow />
      </Suspense>
    </main>
  );
}
