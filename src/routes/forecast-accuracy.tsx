
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
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
  CUTOFFS,
  DAYS_IN_MONTH,
  MONTH_START_UTC,
  type CutoffKey,
} from "@/lib/wind-demo-data";
import { apiGet } from "@/services/api";

export const Route = createFileRoute("/forecast-accuracy")({
  head: () => ({
    meta: [
      { title: "Forecast Accuracy — WindSight UK" },
      {
        name: "description",
        content:
          "Forecast accuracy measured against actual GB wind generation using Elexon BMRS data.",
      },
      { property: "og:title", content: "Forecast Accuracy — WindSight UK" },
      {
        property: "og:description",
        content: "Hourly wind generation forecast accuracy and coverage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForecastAccuracyPage,
});

interface AccuracyRecord {
  decisionDate: string;
  deliveryDate: string;
  deliveryStart: string;
  publishedAt: string;
  forecast: number;
  actual: number;
  error: number;
}

interface AccuracyResponse {
  source: string;
  decisionStartDate: string;
  decisionEndDate: string;
  deliveryStartDate: string;
  deliveryEndDate: string;
  cutoff: CutoffKey;
  cutoffLabel: string;
  timezone: string;
  resolution: string;
  coverage: {
    matchedHours: number;
    expectedHours: number;
    missingHours: number;
    coveragePercent: number;
  };
  metrics: {
    count: number;
    mae: number;
    rmse: number;
    bias: number;
    meanForecast: number;
    meanActual: number;
  };
  records: AccuracyRecord[];
  note: string;
}

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

const mwFmt = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

const integerFmt = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

function dateForIndex(dayIndex: number): string {
  return new Date(
    MONTH_START_UTC + dayIndex * 86_400_000,
  ).toISOString().slice(0, 10);
}

function dayLabel(dayIndex: number): string {
  return `${dayFmt.format(
    new Date(MONTH_START_UTC + dayIndex * 86_400_000),
  )} 2026`;
}

function signedMw(value: number): string {
  return `${value >= 0 ? "+" : "−"}${mwFmt.format(value)} MW`;
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

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

function ForecastAccuracyPage() {
  const [dayIndex, setDayIndex] = useState(0);
  const [cutoffKey, setCutoffKey] =
    useState<CutoffKey>("d1_0900");

  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep the selected-day chart separate from the month-wide KPI summary.
  const [monthlyData, setMonthlyData] = useState<AccuracyResponse | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  const cutoff = CUTOFFS.find((c) => c.key === cutoffKey);
  const decisionDate = dateForIndex(dayIndex);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccuracy() {
      setLoading(true);
      setError(null);
      setData(null);

      const params = new URLSearchParams({
        start_date: decisionDate,
        end_date: decisionDate,
        cutoff: cutoffKey,
      });

      try {
        const result = await apiGet<AccuracyResponse>(
          `/api/accuracy?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load forecast accuracy data.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAccuracy();

    return () => controller.abort();
  }, [decisionDate, cutoffKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMonthlyAccuracy() {
      setMonthlyLoading(true);
      setMonthlyError(null);

      const params = new URLSearchParams({
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        cutoff: cutoffKey,
      });

      try {
        const result = await apiGet<AccuracyResponse>(
          `/api/accuracy?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setMonthlyData(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setMonthlyError(
          err instanceof Error
            ? err.message
            : "Unable to load monthly forecast accuracy data.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setMonthlyLoading(false);
        }
      }
    }

    void loadMonthlyAccuracy();

    return () => controller.abort();
  }, [cutoffKey]);

  const chartData = useMemo(
    () =>
      (data?.records ?? []).map((record) => ({
        time: clockFmt.format(new Date(record.deliveryStart)),
        forecast: record.forecast,
        actual: record.actual,
        error: record.error,
      })),
    [data],
  );

  const dailyMetrics = data?.metrics;
  const dailyCoverage = data?.coverage;
  const monthlyMetrics = monthlyData?.metrics;
  const monthlyCoverage = monthlyData?.coverage;
  const hasData = chartData.length > 0;

  const kpis = [
    {
      label: "January MAE",
      value: monthlyMetrics ? `${mwFmt.format(monthlyMetrics.mae)} MW` : "—",
      note: "Mean absolute error across January",
    },
    {
      label: "January RMSE",
      value: monthlyMetrics ? `${mwFmt.format(monthlyMetrics.rmse)} MW` : "—",
      note: "Penalises larger forecast misses",
    },
    {
      label: "January forecast bias",
      value: monthlyMetrics ? signedMw(monthlyMetrics.bias) : "—",
      note: "Positive means over-forecasting",
    },
    {
      label: "January matched hours",
      value: monthlyMetrics ? integerFmt.format(monthlyMetrics.count) : "—",
      note: monthlyCoverage
        ? `${integerFmt.format(monthlyCoverage.missingHours)} missing · ${monthlyCoverage.coveragePercent}% coverage`
        : "Matched hourly forecast/actual pairs",
    },
  ];

  const periodSummary = data
    ? `Decision date: ${data.decisionStartDate} · Delivery date: ${data.deliveryStartDate} · ${data.cutoffLabel} · ${data.timezone}`
    : `Decision date: ${decisionDate} · Cutoff: ${cutoff?.label ?? cutoffKey}`;

  return (
    <PageContainer>
      <PageHeader
        title="Forecast Accuracy"
        description="Measure GB wind generation forecast performance against actual output using hourly Elexon BMRS data."
        actions={
          <Badge variant="warning" className="font-normal">
            {loading ? "LOADING" : error ? "API ERROR" : "ELEXON API"}
          </Badge>
        }
      />

      <Panel>
        <PanelHeader
          title="Filters"
          description="Choose a decision date and forecast publication cutoff. The backend determines the corresponding delivery date."
        />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="accuracy-decision-date"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Decision date
            </label>
            <Select
              value={String(dayIndex)}
              onValueChange={(value) => setDayIndex(Number(value))}
            >
              <SelectTrigger
                id="accuracy-decision-date"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((index) => (
                  <SelectItem key={index} value={String(index)}>
                    {dayLabel(index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="accuracy-cutoff"
              className="text-xs uppercase tracking-widest text-muted-foreground"
            >
              Forecast publication cutoff
            </label>
            <Select
              value={cutoffKey}
              onValueChange={(value) =>
                setCutoffKey(value as CutoffKey)
              }
            >
              <SelectTrigger id="accuracy-cutoff" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUTOFFS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {cutoff?.description}
            </p>
          </div>
        </PanelBody>
      </Panel>

      {error && (
        <Panel>
          <PanelBody>
            <p className="font-medium text-foreground">
              Could not load forecast accuracy
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {error}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check that the FastAPI backend is running at
              http://127.0.0.1:8000 and that the frontend API URL is configured.
            </p>
          </PanelBody>
        </Panel>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          January performance summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </div>
        {monthlyLoading && (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            Loading January-wide metrics…
          </p>
        )}
        {monthlyError && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            Could not load January-wide metrics: {monthlyError}
          </p>
        )}
      </div>

      {dailyMetrics && (
        <Panel>
          <PanelHeader
            title="Selected-day metrics"
            description={`Metrics for decision date ${data?.decisionStartDate ?? decisionDate}, using ${data?.cutoffLabel ?? cutoffKey}. These are separate from the January summary above.`}
          />
          <PanelBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">MAE</p>
              <p className="mt-2 text-xl font-semibold">{mwFmt.format(dailyMetrics.mae)} MW</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">RMSE</p>
              <p className="mt-2 text-xl font-semibold">{mwFmt.format(dailyMetrics.rmse)} MW</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Bias</p>
              <p className="mt-2 text-xl font-semibold">{signedMw(dailyMetrics.bias)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Matched hours</p>
              <p className="mt-2 text-xl font-semibold">{integerFmt.format(dailyMetrics.count)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dailyCoverage ? `${dailyCoverage.coveragePercent}% coverage` : "Hourly matches"}
              </p>
            </div>
          </PanelBody>
        </Panel>
      )}

      {monthlyCoverage && (
        <Panel>
          <PanelHeader
            title="January data coverage"
            description={`Month-wide coverage for the selected cutoff (${monthlyData?.cutoffLabel ?? cutoffKey}), based on exact matching hourly forecast and actual timestamps.`}
          />
          <PanelBody className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Coverage
              </p>
              <p className="mt-2 text-xl font-semibold">
                {monthlyCoverage.coveragePercent}%
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Expected hours
              </p>
              <p className="mt-2 text-xl font-semibold">
                {monthlyCoverage.expectedHours}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Missing hours
              </p>
              <p className="mt-2 text-xl font-semibold">
                {monthlyCoverage.missingHours}
              </p>
            </div>
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Forecast vs actual generation"
          description="Hourly forecast and actual generation in MW, using UTC delivery timestamps."
          actions={
            <Badge variant="warning" className="font-normal">
              {loading ? "LOADING" : error ? "UNAVAILABLE" : "API DATA"}
            </Badge>
          }
        />
        <PanelBody>
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading hourly forecast and actual data…
            </p>
          ) : hasData ? (
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
                    width={64}
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
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{
                      color: "var(--muted-foreground)",
                    }}
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
                    name="Actual generation"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No matched hourly data"
              description="The API returned no eligible forecast/actual pairs for this decision date and cutoff."
            />
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Interval forecast error"
          description="Hourly forecast minus actual generation in MW. Positive values indicate over-forecasting."
          actions={
            <Badge variant="warning" className="font-normal">
              {loading ? "LOADING" : error ? "UNAVAILABLE" : "API DATA"}
            </Badge>
          }
        />
        <PanelBody>
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading forecast errors…
            </p>
          ) : hasData ? (
            <div className="h-64 w-full">
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
                    width={64}
                    label={{
                      value: "Error (MW)",
                      angle: -90,
                      position: "insideLeft",
                      style: {
                        fill: "var(--muted-foreground)",
                        fontSize: 11,
                      },
                    }}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{
                      color: "var(--muted-foreground)",
                    }}
                    formatter={(value: number | string) =>
                      signedMw(Number(value))
                    }
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--border)"
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="error"
                    name="Forecast error"
                    stroke="var(--signal-orange)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No error data to show"
              description="Forecast errors appear when the API returns matched hourly forecast and actual values."
            />
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="How the metrics are calculated"
          description="The metrics below use the eligible hourly forecast/actual pairs returned by the backend."
        />
        <PanelBody className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-widest text-foreground">
              MAE
            </p>
            <p className="text-muted-foreground">
              Mean absolute error is the average absolute difference between
              forecast and actual generation. Lower values indicate smaller
              errors.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-widest text-foreground">
              RMSE
            </p>
            <p className="text-muted-foreground">
              Root mean squared error penalises larger forecast misses more
              heavily than MAE.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-widest text-foreground">
              Signed bias
            </p>
            <p className="text-muted-foreground">
              Mean forecast minus actual. Positive bias indicates
              over-forecasting; negative bias indicates under-forecasting.
            </p>
          </div>
        </PanelBody>
      </Panel>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {loading ? "Loading data… " : ""}
        {periodSummary}
        {data
          ? ` · selected day: ${data.metrics.count} matched hours · ${data.source}`
          : ""}
        {monthlyData
          ? ` · January: ${monthlyData.metrics.count} matched hours · ${monthlyData.coverage.coveragePercent}% coverage`
          : ""}
      </p>

      {monthlyData && (
        <p className="text-xs text-muted-foreground">
          January summary: {monthlyData.note}
        </p>
      )}
      {data && (
        <p className="text-xs text-muted-foreground">
          Selected day: {data.note}
        </p>
      )}
    </PageContainer>
  );
}
