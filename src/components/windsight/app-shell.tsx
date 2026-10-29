import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

import { WindSightLogo } from "./logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", to: "/" },
  { label: "Forecast Accuracy", to: "/forecast-accuracy" },
  { label: "Publication History", to: "/publication-history" },
] as const;

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/forecast-accuracy": "Forecast Accuracy",
  "/publication-history": "Publication History",
};

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center rounded-md px-3 py-2 text-sm transition-colors duration-200",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-colors duration-200",
                active ? "bg-foreground" : "bg-transparent group-hover:bg-border",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link to="/" onClick={onNavigate} className="rounded-md">
          <WindSightLogo />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Navigation
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="border-t border-sidebar-border px-4 py-3">
        <Badge variant="neutral" className="font-normal">
          Stage 1 · Design system
        </Badge>
      </div>
    </div>
  );
}

/**
 * Application shell: fixed sidebar on desktop, off-canvas on mobile,
 * with a slim top navigation bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = TITLES[pathname] ?? "";

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody />
      </aside>

      {/* Mobile off-canvas sidebar */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-h-screen flex-col md:ml-64">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-medium text-foreground md:hidden">{title}</p>
          <p className="hidden text-sm text-muted-foreground md:block">{title}</p>
          <div className="ml-auto flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-signal-green"
            />
            <span className="text-xs text-muted-foreground">Operational</span>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
            {children}
          </div>
        </main>

        <footer className="border-t border-border px-4 py-4 md:px-8">
          <p className="text-xs text-muted-foreground">
            WindSight UK · Wind energy analytics for Great Britain
          </p>
        </footer>
      </div>
    </div>
  );
}
