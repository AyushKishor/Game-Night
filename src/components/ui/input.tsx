import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "border-border bg-bg-2 text-text placeholder:text-muted/70 focus-visible:border-sky aria-[invalid=true]:border-rose h-12 w-full rounded-xl border px-4 text-base transition-colors",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
