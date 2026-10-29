import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { Panel, PanelBody } from "./page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center">
      <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Panel>
      <PanelBody>
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle className="h-5 w-5 text-signal-orange" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {description ?? "The data could not be prepared. Try again."}
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelBody>
        <Skeleton className="h-full min-h-48 w-full" />
      </PanelBody>
    </Panel>
  );
}
