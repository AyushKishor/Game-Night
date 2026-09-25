import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-lg font-display font-extrabold tracking-tight", className)}>
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-xl bg-coral text-[#1a0d08] shadow-soft",
          size === "lg" ? "size-12 text-2xl" : "size-9 text-lg",
        )}
      >
        ♠
      </span>
      <span className={size === "lg" ? "text-3xl" : "text-xl"}>Game Night</span>
    </Link>
  );
}
