import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,transform,box-shadow,color] duration-150 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97] [&_svg]:size-[1.15em] [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary: "bg-coral text-[#1a0d08] shadow-soft hover:bg-[#ff8f73]",
        secondary: "bg-surface-3 text-text hover:bg-[#2b3963] border border-border",
        ghost: "text-text hover:bg-surface-2",
        outline: "border border-border bg-transparent text-text hover:bg-surface-2",
        mint: "bg-mint text-[#062417] shadow-soft hover:bg-[#5ce6aa]",
        sky: "bg-sky text-[#04212c] shadow-soft hover:bg-[#6fd6f4]",
        danger: "bg-rose text-[#2a0710] hover:bg-[#ff97a7]",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base",
        lg: "h-14 px-6 text-lg",
        xl: "h-16 px-8 text-xl",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
