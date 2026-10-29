import { describe, expect, it } from "vitest";

import {
  buildJanuary2026,
  computeMetrics,
  cutoffInstantFor,
  CUTOFFS,
  deliveryDayStartUtc,
  selectDayRecords,
  selectRecordsForCutoff,
  type ForecastRecord,
} from "@/lib/wind-demo-data";

describe("cutoff filtering", () => {
  it("only admits forecasts published by the decision instant", () => {
    const records = buildJanuary2026();
    for (const cutoff of CUTOFFS) {
      const eligible = selectRecordsForCutoff(records, cutoff.key);
      expect(eligible.length).toBeGreaterThan(0);
      for (const r of eligible) {
        const decision = cutoffInstantFor(
          deliveryDayStartUtc(r.deliveryStart),
          cutoff.key,
        );
        expect(r.publishedAt <= decision).toBe(true);
      }
    }
  });

  it("excludes a forecast published after the decision cutoff", () => {
    const records = buildJanuary2026();
    const sample = records[0];
    if (!sample) throw new Error("demo dataset should not be empty");
    const decision = cutoffInstantFor(
      deliveryDayStartUtc(sample.deliveryStart),
      "d1_0900",
    );
    const late: ForecastRecord = {
      ...sample,
      publishedAt: new Date(Date.parse(decision) + 1).toISOString(),
    };
    expect(selectRecordsForCutoff([late], "d1_0900")).toHaveLength(0);
  });

  it("returns the 48 half-hourly intervals of the requested day", () => {
    const records = buildJanuary2026();
    for (const cutoff of CUTOFFS) {
      const day = selectDayRecords(records, cutoff.key, 5);
      expect(day).toHaveLength(48);
      for (const r of day) {
        expect(r.deliveryStart.startsWith("2026-01-06")).toBe(true);
      }
    }
  });

  it("yields a later, sharper vintage a smaller MAE", () => {
    const records = buildJanuary2026();
    const maeFor = (key: (typeof CUTOFFS)[number]["key"]) =>
      computeMetrics(selectRecordsForCutoff(records, key)).mae;
    expect(maeFor("d2_1200")).toBeGreaterThan(maeFor("d1_0900"));
    expect(maeFor("d1_0900")).toBeGreaterThan(maeFor("d1_1500"));
  });
});

describe("metric calculations", () => {
  it("computes MAE, RMSE and signed bias from known pairs", () => {
    const records: ForecastRecord[] = [
      {
        deliveryStart: "2026-01-01T00:00:00.000Z",
        publishedAt: "2026-01-01T00:00:00.000Z",
        forecast: 1100,
        actual: 1000,
      },
      {
        deliveryStart: "2026-01-01T00:30:00.000Z",
        publishedAt: "2026-01-01T00:00:00.000Z",
        forecast: 900,
        actual: 1000,
      },
      {
        deliveryStart: "2026-01-01T01:00:00.000Z",
        publishedAt: "2026-01-01T00:00:00.000Z",
        forecast: 1000,
        actual: 1000,
      },
    ];
    const m = computeMetrics(records);
    expect(m.count).toBe(3);
    expect(m.mae).toBeCloseTo(200 / 3, 10);
    expect(m.rmse).toBeCloseTo(Math.sqrt(20000 / 3), 10);
    expect(m.bias).toBeCloseTo(0, 10);
    expect(m.meanForecast).toBeCloseTo(1000, 10);
    expect(m.meanActual).toBeCloseTo(1000, 10);
  });

  it("returns zeros for an empty selection", () => {
    const m = computeMetrics([]);
    expect(m.count).toBe(0);
    expect(m.mae).toBe(0);
    expect(m.rmse).toBe(0);
    expect(m.bias).toBe(0);
    expect(m.meanForecast).toBe(0);
    expect(m.meanActual).toBe(0);
  });
});
