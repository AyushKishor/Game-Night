import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border border-border bg-bg-2 px-4 text-base text-text placeholder:text-muted/70 transition-colors focus-visible:border-sky aria-[invalid=true]:border-rose",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
