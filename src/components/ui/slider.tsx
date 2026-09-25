"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabel?: string }
>(({ className, thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex h-7 w-full touch-none items-center select-none", className)}
    {...props}
  >
    <SliderPrimitive.Track className="bg-surface-3 relative h-2 w-full grow overflow-hidden rounded-full">
      <SliderPrimitive.Range className="bg-sky absolute h-full" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbLabel}
      className="border-sky bg-text block size-6 rounded-full border-2 shadow transition-transform hover:scale-110"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
