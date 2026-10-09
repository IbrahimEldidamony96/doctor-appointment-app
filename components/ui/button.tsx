import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-bold transition-all duration-200 focus-visible:ring-4 focus-visible:ring-teal-100 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-white shadow-[0_8px_20px_-10px_#087e83] hover:bg-[#05666b] hover:-translate-y-0.5",
        outline: "border-border bg-white text-slate-800 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800",
        secondary: "bg-secondary text-secondary-foreground hover:bg-teal-100",
        ghost: "text-slate-700 hover:bg-muted hover:text-teal-800",
        destructive: "bg-red-50 text-red-700 hover:bg-red-100",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-9 px-3.5 py-1.5 text-xs",
        xs: "min-h-8 px-3 text-xs",
        lg: "min-h-13 px-7 py-3 text-base",
        icon: "size-11",
        "icon-xs": "size-8",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

function Button({ className, variant = "default", size = "default", ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
