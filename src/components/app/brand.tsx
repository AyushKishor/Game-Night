import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <Link
      href="/"
      className={cn("font-display inline-flex items-center gap-2 rounded-lg font-extrabold tracking-tight", className)}
    >
      <span
        aria-hidden
        className={cn(
          "bg-coral shadow-soft grid place-items-center rounded-xl text-[#1a0d08]",
          size === "lg" ? "size-12 text-2xl" : "size-9 text-lg",
        )}
      >
        ♠
      </span>
      <span className={size === "lg" ? "text-3xl" : "text-xl"}>Game Night</span>
    </Link>
  );
}
