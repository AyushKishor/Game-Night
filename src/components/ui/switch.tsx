"use client";
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer border-border bg-surface-3 data-[state=checked]:border-mint data-[state=checked]:bg-mint inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="bg-text pointer-events-none block size-5 translate-x-1 rounded-full shadow transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-[#062417]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
