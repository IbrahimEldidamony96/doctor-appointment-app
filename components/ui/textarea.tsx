import * as React from "react";
import { cn } from "cn";
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("min-h-28 w-full resize-y rounded-xl border border-input bg-white px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:opacity-60", className)} {...props} />;
}
