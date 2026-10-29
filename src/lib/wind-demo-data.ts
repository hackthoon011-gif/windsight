/**
 * DEMO DATA — deterministic mock wind data for the Overview dashboard.
 *
 * These numbers are generated for layout purposes only. They are NOT live
 * Elexon market data and no live API integration exists yet. Any UI showing
 * this data must be labelled "DEMO DATA".
 *
 * All timestamps are UTC ISO strings. January 2026, 48 × 30-minute
 * delivery intervals per day, three forecast publication vintages
 * ("cutoffs"). The PRNG is seeded so server and client renders match.
 */

export type CutoffKey = "d2_1200" | "d1_0900" | "d1_1500";

export interface Cutoff {
  key: CutoffKey;
  /** Decision time: only forecasts published by this instant may be used. */
  label: string;
  description: string;
}

export const CUTOFFS: Cutoff[] = [
  {
    key: "d2_1200",
    label: "12:00, two days ahead",
    description: "Forecasts published at 12:00 UTC, two days before delivery.",
  },
  {
    key: "d1_0900",
    label: "09:00, day ahead",
    description: "Forecasts published at 09:00 UTC, the day before delivery.",
  },
  {
    key: "d1_1500",
    label: "15:00, day ahead",
    description: "Forecasts published at 15:00 UTC, the day before delivery.",
  },
];

/** Publication lead time of each vintage, in hours before the delivery day starts. */
const VINTAGE_LEAD_HOURS: Record<CutoffKey, number> = {
  d2_1200: 36, // D-2 12:00
  d1_0900: 15, // D-1 09:00
  d1_1500: 9, // D-1 15:00
};

/** Expected forecast error amplitude per vintage (MW); later publications are sharper. */
const VINTAGE_ERROR_MW: Record<CutoffKey, number> = {
  d2_1200: 1000,
  d1_0900: 650,
  d1_1500: 420,
};

export const MONTH_START_UTC = Date.UTC(2026, 0, 1);
export const DAYS_IN_MONTH = 31;
export const INTERVALS_PER_DAY = 48;
export const INTERVAL_MINUTES = 30;

export interface ForecastRecord {
  /** Delivery interval start, ISO UTC. */
  deliveryStart: string;
  /** When the forecast covering this interval was published, ISO UTC. */
  publishedAt: string;
  /** Forecast generation for the interval, MW. */
  forecast: number;
  /** Actual generation for the interval, MW. */
  actual: number;
}

/** Deterministic PRNG (mulberry32) so SSR and client renders are identical. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth pseudo-actual profile: winter GB wind shape in MW. */
function actualFor(dayIndex: number, interval: number, rnd: number): number {
  const hour = interval / 2;
  const diurnal = 900 * Math.sin(((hour - 4) / 24) * Math.PI * 2);
  const synoptic = 2600 * Math.sin(dayIndex / 4.7 + 1.1);
  const front = 1500 * Math.sin(dayIndex / 1.9 + interval / 26);
  const gust = 350 * Math.sin(interval / 7.3 + dayIndex);
  const noise = (rnd - 0.5) * 500;
  const mw = 4800 + synoptic + front + diurnal + gust + noise;
  return Math.min(12500, Math.max(250, Math.round(mw / 10) * 10));
}

/**
 * Build the full demo month. Returns one record per (interval, vintage).
 * Ordered by delivery time, then vintage lead (longest first).
 */
export function buildJanuary2026(): ForecastRecord[] {
  const records: ForecastRecord[] = [];
  let seed = 20260101;
  for (let day = 0; day < DAYS_IN_MONTH; day++) {
    const dayStart = MONTH_START_UTC + day * 86_400_000;
    // Per-vintage daily bias so error metrics differ meaningfully by cutoff.
    const biasRnd = mulberry32(seed + 77);
    const dayBias = (biasRnd() - 0.5) * 500;

    for (const cutoff of CUTOFFS) {
      const leadMs = VINTAGE_LEAD_HOURS[cutoff.key] * 3_600_000;
      const publishedAt = new Date(dayStart - leadMs).toISOString();
      const amplitude = VINTAGE_ERROR_MW[cutoff.key];
      for (let interval = 0; interval < INTERVALS_PER_DAY; interval++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const rnd = mulberry32(seed)();
        const actual = actualFor(day, interval, rnd);
        const errRnd = mulberry32(seed ^ 0x9e3779b9)();
        const diurnalError = 250 * Math.sin((interval / INTERVALS_PER_DAY) * Math.PI * 2);
        const error = dayBias + diurnalError + (errRnd - 0.5) * 2 * amplitude;
        const forecast = Math.min(13000, Math.max(150, Math.round(actual + error)));
        records.push({
          deliveryStart: new Date(dayStart + interval * INTERVAL_MINUTES * 60_000).toISOString(),
          publishedAt,
          forecast,
          actual,
        });
      }
    }
  }
  return records;
}

/** The decision instant for a cutoff, for forecasts delivering on `deliveryDayStartUtcMs`. */
export function cutoffInstantFor(deliveryDayStartUtcMs: number, cutoff: CutoffKey): string {
  return new Date(deliveryDayStartUtcMs - VINTAGE_LEAD_HOURS[cutoff] * 3_600_000).toISOString();
}

/** Delivery-day start (UTC midnight) for an ISO delivery timestamp. */
export function deliveryDayStartUtc(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/**
 * Integrity rule: a record is admissible only if its forecast was published
 * by the cutoff decision time for its own delivery day.
 */
export function selectRecordsForCutoff(
  records: ForecastRecord[],
  cutoff: CutoffKey,
): ForecastRecord[] {
  return records.filter((r) => {
    const decision = cutoffInstantFor(deliveryDayStartUtc(r.deliveryStart), cutoff);
    return r.publishedAt <= decision;
  });
}

/** Records for one UTC delivery day, already filtered to the cutoff.
 *
 * Several vintages can be admissible at a decision instant (an older forecast
 * published earlier is still available). For each interval the latest eligible
 * vintage is the operative forecast, so one record per interval is returned.
 */
export function selectDayRecords(
  records: ForecastRecord[],
  cutoff: CutoffKey,
  dayIndex: number,
): ForecastRecord[] {
  const dayStart = MONTH_START_UTC + dayIndex * 86_400_000;
  const day = new Date(dayStart).toISOString().slice(0, 10);
  const eligible = selectRecordsForCutoff(records, cutoff).filter((r) =>
    r.deliveryStart.startsWith(day),
  );
  const latestByInterval = new Map<string, ForecastRecord>();
  for (const r of eligible) {
    const current = latestByInterval.get(r.deliveryStart);
    if (!current || r.publishedAt > current.publishedAt) {
      latestByInterval.set(r.deliveryStart, r);
    }
  }
  return [...latestByInterval.values()].sort((a, b) =>
    a.deliveryStart.localeCompare(b.deliveryStart),
  );
}

export interface AccuracyMetrics {
  meanForecast: number;
  meanActual: number;
  /** Mean absolute error, MW. */
  mae: number;
  /** Root mean squared error, MW. */
  rmse: number;
  /** Mean signed error (forecast − actual), MW. */
  bias: number;
  count: number;
}

export function computeMetrics(records: ForecastRecord[]): AccuracyMetrics {
  const count = records.length;
  let sumForecast = 0;
  let sumActual = 0;
  let sumAbs = 0;
  let sumSq = 0;
  let sumSigned = 0;
  for (const r of records) {
    const error = r.forecast - r.actual;
    sumForecast += r.forecast;
    sumActual += r.actual;
    sumAbs += Math.abs(error);
    sumSq += error * error;
    sumSigned += error;
  }
  return {
    meanForecast: count ? sumForecast / count : 0,
    meanActual: count ? sumActual / count : 0,
    mae: count ? sumAbs / count : 0,
    rmse: count ? Math.sqrt(sumSq / count) : 0,
    bias: count ? sumSigned / count : 0,
    count,
  };
}
