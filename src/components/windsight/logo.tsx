import { cn } from "@/lib/utils";

/**
 * WindSight UK original mark: a stylised three-blade turbine hub.
 * Monochrome by default; inherits currentColor.
 */
export function WindSightMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
    >
      <circle cx="12" cy="12.2" r="1.7" fill="currentColor" />
      <path
        d="M12 10.5V3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13.6 13.1l6 3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.4 13.1l-6 3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WindSightLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card">
        <WindSightMark className="h-4.5 w-4.5" />
      </span>
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          WindSight
        </span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          UK
        </span>
      </span>
    </div>
  );
}
