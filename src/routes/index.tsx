import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  computeMetrics,
  CUTOFFS,
  DAYS_IN_MONTH,
  MONTH_START_UTC,
  selectDayRecords,
  type CutoffKey,
} from "@/lib/wind-demo-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — WindSight UK" },
      {
        name: "description",
        content:
          "Wind generation overview for Great Britain: forecast vs actual output, error metrics and recent forecast records (demo data, January 2026).",
      },
      { property: "og:title", content: "Overview — WindSight UK" },
      {
        property: "og:description",
        content:
          "National wind generation forecast and actual performance — January 2026.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});

// Deterministic demo dataset — identical on server and client, so it is safe
// to derive directly during render (no fetch, no hydration mismatch).
const ALL_RECORDS = buildJanuary2026();
const ALL_CUTOFFS = CUTOFFS;
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

function signedMw(value: number): string {
  return `${value >= 0 ? "+" : "−"}${mwFmt.format(Math.abs(value))} MW`;
}

function KpiCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Panel>
      <PanelBody>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
      </PanelBody>
    </Panel>
  );
}

function OverviewPage() {
  const [dayIndex, setDayIndex] = useState(0);
  const [cutoffKey, setCutoffKey] = useState<CutoffKey>("d1_0900");

  const cutoff = ALL_CUTOFFS.find((c) => c.key === cutoffKey);


  const dayRecords = useMemo(
    () => selectDayRecords(ALL_RECORDS, cutoffKey, dayIndex),
    [cutoffKey, dayIndex],
  );
  const metrics = useMemo(() => computeMetrics(dayRecords), [dayRecords]);

  const chartData = useMemo(
    () =>
      dayRecords.map((r) => ({
        time: clockFmt.format(new Date(r.deliveryStart)),
        forecast: r.forecast,
        actual: r.actual,
      })),
    [dayRecords],
  );

  const tableRows = useMemo(() => dayRecords.slice(-8).reverse(), [dayRecords]);

  const kpis = [
    {
      label: "Forecast Generation",
      value: `${mwFmt.format(metrics.meanForecast)} MW`,
      note: "Mean of eligible forecasts",
    },
    {
      label: "Actual Generation",
      value: `${mwFmt.format(metrics.meanActual)} MW`,
      note: "Mean of actuals for the day",
    },
    {
      label: "Mean Absolute Error (MAE)",
      value: `${mwFmt.format(metrics.mae)} MW`,
      note: "Mean |forecast − actual|",
    },
    {
      label: "Root Mean Squared Error (RMSE)",
      value: `${mwFmt.format(metrics.rmse)} MW`,
      note: "Quadratic mean error",
    },
    {
      label: "Forecast Bias",
      value: signedMw(metrics.bias),
      note: "Mean signed error (forecast − actual)",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Wind Generation Overview"
        description="National wind generation forecast and actual performance — January 2026."
        actions={
          <>
            <Badge variant="warning" className="font-normal">
              DEMO DATA
            </Badge>
            <Button size="sm" asChild>
              <Link to="/forecast-accuracy">
                Explore accuracy
                <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <Panel>
        <PanelHeader
          title="Filters"
          description="The cutoff selector excludes any forecast published after the selected decision time."
        />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="delivery-date"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Delivery date
            </label>
            <Select
              value={String(dayIndex)}
              onValueChange={(v) => setDayIndex(Number(v))}
            >
              <SelectTrigger id="delivery-date" className="w-full">
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
              htmlFor="cutoff"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Forecast publication cutoff
            </label>
            <Select value={cutoffKey} onValueChange={(v) => setCutoffKey(v as CutoffKey)}>
              <SelectTrigger id="cutoff" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CUTOFFS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{cutoff?.description}</p>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <Panel>

        <PanelHeader
          title="Forecast vs actual generation"
          description="48 half-hourly delivery intervals per day, UTC. Deterministic demo data — not live Elexon market data."
        />

        <PanelBody>
          {chartData.length === 0 ? (
            <EmptyState
              title="No eligible forecasts for this day"
              description="No forecast vintage was published before the selected cutoff for this delivery date."
            />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    label={{
                      value: "Generation (MW)",
                      angle: -90,
                      position: "insideLeft",
                      style: {
                        fill: "var(--muted-foreground)",
                        fontSize: 11,
                      },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(value: number | string) =>
                      `${mwFmt.format(Number(value))} MW`
                    }
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 12,
                      color: "var(--muted-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast"
                    stroke="var(--chart-2)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Recent forecast records"
          description="Latest delivery intervals for the selected day and cutoff, newest first. Delivery start is kept separate from forecast publication time."
          actions={null}
        />
        <PanelBody>
          {tableRows.length === 0 ? (
            <EmptyState
              title="No records to show"
              description="No forecast vintage was published before the selected cutoff for this delivery date."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Delivery start (UTC)</th>
                    <th className="py-2 pr-4 font-medium">Forecast published (UTC)</th>
                    <th className="py-2 pr-4 text-right font-medium">Forecast (MW)</th>
                    <th className="py-2 pr-4 text-right font-medium">Actual (MW)</th>
                    <th className="py-2 text-right font-medium">Error (MW)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => {
                    const error = r.forecast - r.actual;
                    return (
                      <tr
                        key={r.deliveryStart}
                        className="border-b border-border/60 text-foreground tabular-nums last:border-0"
                      >
                        <td className="py-2 pr-4">{clockFmt.format(new Date(r.deliveryStart))}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {pubFmt.format(new Date(r.publishedAt))}
                        </td>
                        <td className="py-2 pr-4 text-right">{mwFmt.format(r.forecast)}</td>
                        <td className="py-2 pr-4 text-right">{mwFmt.format(r.actual)}</td>
                        <td
                          className={
                            error >= 0
                              ? "py-2 text-right text-foreground"
                              : "py-2 text-right text-signal-orange"
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
        <p className="text-xs text-muted-foreground">
          Data shown is for January 2026. Forecast and actual generation figures
          are currently illustrative and will be connected to live Elexon data.
        </p>
      </p>
    </PageContainer>
  );
}
