import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/windsight/page";
import { EmptyState } from "@/components/windsight/states";
import {
  buildJanuary2026,
  selectRecordsForCutoff,
  MONTH_START_UTC,
  DAYS_IN_MONTH,
  type CutoffKey,
  type ForecastRecord,
} from "@/lib/wind-demo-data";

export const Route = createFileRoute("/publication-history")({
  head: () => ({
    meta: [
      { title: "Forecast Publication History — WindSight UK" },
      {
        name: "description",
        content:
          "Every wind generation forecast published for January 2026, by delivery interval and publication time.",
      },
      {
        property: "og:title",
        content: "Forecast Publication History — WindSight UK",
      },
      {
        property: "og:description",
        content:
          "Every wind generation forecast published for January 2026, by delivery interval and publication time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicationHistoryPage,
});

// Deterministic ataset — identical on server and client, so it is safe
// to derive directly during render (no fetch, no hydration mismatch).
const ALL_RECORDS = buildJanuary2026();
const DAY_OPTIONS = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i);

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const clockFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const pubFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const mwFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

function dayLabel(dayIndex: number): string {
  return `${dayFmt.format(new Date(MONTH_START_UTC + dayIndex * 86_400_000))} 2026`;
}

/** Renders a value, or an explicit dash when it is missing or unavailable. */
function fmtOrDash(value: number | null | undefined, format: (v: number) => string): string {
  return value == null || Number.isNaN(value) ? "—" : format(value);
}

function signedMw(value: number): string {
  return `${value >= 0 ? "+" : "−"}${mwFmt.format(Math.abs(value))} MW`;
}

type SortKey = "deliveryStart" | "publishedAt" | "forecast" | "actual" | "error";
type SortDir = "asc" | "desc";

const COLUMN_LABELS: Record<SortKey, string> = {
  deliveryStart: "Delivery start (UTC)",
  publishedAt: "Forecast published (UTC)",
  forecast: "Forecast (MW)",
  actual: "Actual (MW)",
  error: "Error (MW)",
};

const NUMERIC_COLUMNS: ReadonlySet<SortKey> = new Set(["forecast", "actual", "error"]);

function PublicationHistoryPage() {
  const [dayIndex, setDayIndex] = useState(0);
  const [cutoffKey, setCutoffKey] = useState<CutoffKey>("d1_1500");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deliveryStart");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // All forecast vintages published by the decision cutoff for the selected
  // delivery day — several publications can cover the same interval.
  const dayRecords = useMemo(() => {
    const dayStart = MONTH_START_UTC + dayIndex * 86_400_000;
    const isoDay = new Date(dayStart).toISOString().slice(0, 10);
    return selectRecordsForCutoff(ALL_RECORDS, cutoffKey).filter((r) =>
      r.deliveryStart.startsWith(isoDay),
    );
  }, [cutoffKey, dayIndex]);

  // Search across formatted times and values so what the user sees is what
  // they can match. Delivery date filtering happens in dayRecords above.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dayRecords;
    return dayRecords.filter((r) => {
      const error = r.forecast - r.actual;
      const haystack = [
        clockFmt.format(new Date(r.deliveryStart)),
        pubFmt.format(new Date(r.publishedAt)),
        r.forecast,
        r.actual,
        error,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dayRecords, search]);

  const sorted = useMemo(() => {
    const rows = [...searched];
    const numeric = NUMERIC_COLUMNS.has(sortKey);
    const factor = sortDir === "asc" ? 1 : -1;
    const valueOf = (r: ForecastRecord): number | string =>
      sortKey === "error" ? r.forecast - r.actual : r[sortKey];
    rows.sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (numeric) return (Number(av) - Number(bv)) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
    return rows;
  }, [searched, sortKey, sortDir]);

  const summary = useMemo(() => {
    const intervals = new Set(dayRecords.map((r) => r.deliveryStart));
    const totalError = sorted.reduce((sum, r) => sum + (r.forecast - r.actual), 0);
    const meanError = sorted.length ? totalError / sorted.length : null;
    return { records: sorted.length, intervals: intervals.size, meanError };
  }, [dayRecords, sorted]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Forecast Publication History"
        description="Every forecast publication kept on record for January 2026, with the delivery interval it covers and the actual generation later observed."
        actions={
          null
        }
      />

      <Panel>
        <PanelHeader
          title="Delivery time vs publication time"
          description="Delivery start is when the half-hour ends up being generated. Forecast published is when the forecast covering that interval was issued — always earlier, and always shown in UTC."
        />
        <PanelBody className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor="history-delivery-date"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Delivery date
            </label>
            <Select
              value={String(dayIndex)}
              onValueChange={(v) => setDayIndex(Number(v))}
            >
              <SelectTrigger id="history-delivery-date" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {dayLabel(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="history-cutoff"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Forecast publication cutoff
            </label>
            <Select value={cutoffKey} onValueChange={(v) => setCutoffKey(v as CutoffKey)}>
              <SelectTrigger id="history-cutoff" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  { key: "d2_1200" as CutoffKey, label: "12:00, two days ahead" },
                  { key: "d1_0900" as CutoffKey, label: "09:00, day ahead" },
                  { key: "d1_1500" as CutoffKey, label: "15:00, day ahead" },
                ].map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only forecasts published by the decision time are listed.
            </p>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="history-search"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="history-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a time or MW value…"
                className="pl-8"
              />
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Published forecast records"
          description="Newest and oldest ordering follows the column you sort by. Delivery start is kept separate from forecast publication time."
          actions={
           null
          }
        />
        <PanelBody className="space-y-3">
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {summary.records > 0
              ? `Showing ${mwFmt.format(summary.records)} records across ${mwFmt.format(summary.intervals)} delivery intervals · mean error ${signedMw(summary.meanError ?? 0)}`
              : `No records to show for ${dayLabel(dayIndex)} at the selected cutoff`}
          </p>

          {dayRecords.length === 0 ? (
            <EmptyState
              title="No eligible publications for this day"
              description="No forecast vintage was published before the selected cutoff for this delivery date."
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              title="No records match your search"
              description="Try a different time (e.g. 09:00) or MW value, or clear the search to see all records."
            />
          ) : (
            <div className="max-h-[32rem] w-full min-w-0 max-w-full overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                    {(Object.keys(COLUMN_LABELS) as SortKey[]).map((key) => {
                      const active = sortKey === key;
                      const Icon =
                        active && sortDir === "desc"
                          ? ArrowDown
                          : active
                            ? ArrowUp
                            : ArrowUpDown;
                      return (
                        <th
                          key={key}
                          className={
                            NUMERIC_COLUMNS.has(key)
                              ? "px-2 py-2 text-right font-medium"
                              : "px-2 py-2 font-medium"
                          }
                          aria-sort={
                            active
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSort(key)}
                            className={
                              NUMERIC_COLUMNS.has(key)
                                ? "h-auto gap-1 whitespace-nowrap px-1 py-1 text-xs uppercase tracking-widest"
                                : "h-auto gap-1 whitespace-nowrap px-1 py-1 text-xs uppercase tracking-widest"
                            }
                          >
                            {COLUMN_LABELS[key]}
                            <Icon className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r: ForecastRecord) => {
                    const error = r.forecast - r.actual;
                    return (
                      <tr
                        key={`${r.deliveryStart}-${r.publishedAt}`}
                        className="border-b border-border/60 text-foreground tabular-nums last:border-0"
                      >
                        <td className="whitespace-nowrap px-2 py-2">
                          {clockFmt.format(new Date(r.deliveryStart))}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {fmtOrDash(
                            r.publishedAt ? Date.parse(r.publishedAt) : null,
                            () => pubFmt.format(new Date(r.publishedAt)),
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {fmtOrDash(r.forecast, (v) => mwFmt.format(v))}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {fmtOrDash(r.actual, (v) => mwFmt.format(v))}
                        </td>
                        <td
                          className={
                            error >= 0
                              ? "px-2 py-2 text-right"
                              : "px-2 py-2 text-right text-signal-orange"
                          }
                        >
                          {signedMw(error)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>

      <p className="text-xs text-muted-foreground">
        Data shown is for January 2026. Forecast and actual generation figures
        are currently illustrative and will be connected to live Elexon data.
      </p>
    </PageContainer>
  );
}
