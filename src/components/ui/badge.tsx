import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-text",
      coral: "bg-coral/15 text-coral",
      mint: "bg-mint/15 text-mint",
      sky: "bg-sky/15 text-sky",
      amber: "bg-amber/15 text-amber",
      violet: "bg-violet/15 text-violet",
      rose: "bg-rose/15 text-rose",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
