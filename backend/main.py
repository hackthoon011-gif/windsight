from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from math import sqrt
import json
import os
import sqlite3

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="WindSight API",
    description="UK wind forecast accuracy using Elexon BMRS data.",
    version="1.2.0",
)

# Configure extra frontend origins through WINDSIGHT_CORS_ORIGINS, comma-separated.
DEFAULT_ORIGINS = [
    "http://192.168.0.8:8080",
    "http://localhost:8080",
    "http://localhost:8090",
    "http://127.0.0.1:8090",	
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
extra_origins = [
    origin.strip()
    for origin in os.getenv("WINDSIGHT_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(DEFAULT_ORIGINS + extra_origins)),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CACHE_DIR = Path(
    os.getenv("WINDSIGHT_CACHE_DIR", str(Path(__file__).resolve().parent))
).resolve()
CACHE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = CACHE_DIR / "windsight_cache.db"
CACHE_HOURS = 6
WINDFOR_CHUNK_DAYS = 1
FUELHH_CHUNK_DAYS = 7

CUTOFF_HOURS = {
    "d2_1200": 36,
    "d1_0900": 15,
    "d1_1500": 9,
}
CUTOFF_LABELS = {
    "d2_1200": "D-2 12:00 UTC",
    "d1_0900": "D-1 09:00 UTC",
    "d1_1500": "D-1 15:00 UTC",
}


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_cache (
                cache_key TEXT PRIMARY KEY,
                fetched_at TEXT NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )


init_db()


def parse_utc(value: str) -> datetime:
    """Parse an ISO timestamp and normalize it to UTC."""
    if not isinstance(value, str):
        raise ValueError("Timestamp must be a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def read_cache(cache_key: str):
    with sqlite3.connect(DB_PATH) as conn:
        cached = conn.execute(
            "SELECT fetched_at, payload FROM api_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()

    if not cached:
        return None

    try:
        fetched_at = datetime.fromisoformat(cached[0])
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - fetched_at
        if timedelta(0) <= age < timedelta(hours=CACHE_HOURS):
            payload = json.loads(cached[1])
            return payload if isinstance(payload, list) else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def save_cache(cache_key: str, rows: list):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO api_cache (cache_key, fetched_at, payload)
            VALUES (?, ?, ?)
            """,
            (
                cache_key,
                datetime.now(timezone.utc).isoformat(),
                json.dumps(rows),
            ),
        )


def request_dataset(endpoint: str, params: dict) -> list:
    """Fetch one Elexon request and validate the response shape."""
    url = f"{BASE_URL}/{endpoint}"
    try:
        with httpx.Client(timeout=90.0, follow_redirects=True) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            result = response.json()
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "")[:1000]
        raise HTTPException(
            status_code=502,
            detail=(
                f"Elexon {endpoint} returned HTTP {exc.response.status_code}. "
                f"URL: {exc.request.url}. Response: {body}"
            ),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach Elexon {endpoint}: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Elexon {endpoint} returned invalid JSON.",
        ) from exc

    rows = result.get("data", []) if isinstance(result, dict) else result
    if not isinstance(rows, list):
        raise HTTPException(
            status_code=502,
            detail=(
                f"Unexpected response format from Elexon {endpoint}; "
                "expected a list or an object containing a list in 'data'."
            ),
        )
    print(f"ELEXON {endpoint}: received {len(rows)} rows")
    return rows


def _deduplicate_rows(rows: list) -> list:
    unique_rows = []
    seen_rows = set()
    for row in rows:
        signature = json.dumps(row, sort_keys=True, default=str)
        if signature not in seen_rows:
            seen_rows.add(signature)
            unique_rows.append(row)
    return unique_rows


def fetch_dataset(cache_key: str, endpoint: str, params: dict) -> list:
    # WINDFOR is requested in daily publication-time windows.
    if (
        endpoint == "WINDFOR"
        and "publishDateTimeFrom" in params
        and "publishDateTimeTo" in params
    ):
        overall_start = parse_utc(params["publishDateTimeFrom"])
        overall_end = parse_utc(params["publishDateTimeTo"])
        if overall_start >= overall_end:
            raise HTTPException(
                status_code=400,
                detail="Invalid WINDFOR publication date range.",
            )

        all_rows = []
        cursor = overall_start
        chunk_size = timedelta(days=WINDFOR_CHUNK_DAYS)

        while cursor < overall_end:
            chunk_end = min(cursor + chunk_size, overall_end)
            chunk_params = dict(params)
            chunk_params["publishDateTimeFrom"] = (
                cursor.isoformat().replace("+00:00", "Z")
            )
            chunk_params["publishDateTimeTo"] = (
                chunk_end.isoformat().replace("+00:00", "Z")
            )
            chunk_key = (
                f"v5:{cache_key}:chunk:"
                f"{cursor.isoformat()}:{chunk_end.isoformat()}"
            )
            chunk_rows = read_cache(chunk_key)
            if chunk_rows is None:
                print(
                    "WINDFOR REQUEST:",
                    chunk_params["publishDateTimeFrom"],
                    "TO",
                    chunk_params["publishDateTimeTo"],
                )
                chunk_rows = request_dataset(endpoint, chunk_params)
                save_cache(chunk_key, chunk_rows)
            else:
                print(
                    f"WINDFOR CACHE: {len(chunk_rows)} rows for "
                    f"{chunk_params['publishDateTimeFrom']} to "
                    f"{chunk_params['publishDateTimeTo']}"
                )
            all_rows.extend(chunk_rows)
            cursor = chunk_end

        unique_rows = _deduplicate_rows(all_rows)
        save_cache(f"v5:{cache_key}:aggregate", unique_rows)
        print(
            f"WINDFOR AGGREGATE: {len(all_rows)} rows before deduplication, "
            f"{len(unique_rows)} after deduplication"
        )
        return unique_rows

    # FUELHH permits at most seven inclusive settlement dates per request.
    if (
        endpoint == "FUELHH"
        and "settlementDateFrom" in params
        and "settlementDateTo" in params
    ):
        overall_start = date.fromisoformat(params["settlementDateFrom"])
        overall_end = date.fromisoformat(params["settlementDateTo"])
        if overall_start > overall_end:
            raise HTTPException(
                status_code=400,
                detail="Invalid FUELHH settlement date range.",
            )

        all_rows = []
        cursor = overall_start
        while cursor <= overall_end:
            chunk_end = min(
                cursor + timedelta(days=FUELHH_CHUNK_DAYS - 1),
                overall_end,
            )
            chunk_params = dict(params)
            chunk_params["settlementDateFrom"] = cursor.isoformat()
            chunk_params["settlementDateTo"] = chunk_end.isoformat()
            chunk_key = (
                f"v5:{cache_key}:chunk:"
                f"{cursor.isoformat()}:{chunk_end.isoformat()}"
            )
            chunk_rows = read_cache(chunk_key)
            if chunk_rows is None:
                print(
                    "FUELHH REQUEST:",
                    chunk_params["settlementDateFrom"],
                    "TO",
                    chunk_params["settlementDateTo"],
                )
                chunk_rows = request_dataset(endpoint, chunk_params)
                save_cache(chunk_key, chunk_rows)
            else:
                print(
                    f"FUELHH CACHE: {len(chunk_rows)} rows for "
                    f"{chunk_params['settlementDateFrom']} to "
                    f"{chunk_params['settlementDateTo']}"
                )
            all_rows.extend(chunk_rows)
            cursor = chunk_end + timedelta(days=1)

        unique_rows = _deduplicate_rows(all_rows)
        save_cache(f"v5:{cache_key}:aggregate", unique_rows)
        print(
            f"FUELHH AGGREGATE: {len(all_rows)} rows before deduplication, "
            f"{len(unique_rows)} after deduplication"
        )
        return unique_rows

    versioned_cache_key = f"v5:{cache_key}"
    cached_result = read_cache(versioned_cache_key)
    if cached_result is not None:
        return cached_result
    rows = request_dataset(endpoint, params)
    save_cache(versioned_cache_key, rows)
    return rows


@app.get("/")
def home():
    return {
        "app": "WindSight",
        "status": "running",
        "message": "WindSight backend is ready.",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "windsight-api",
        "version": app.version,
    }


@app.get("/api/accuracy")
def forecast_accuracy(
    start_date: date = Query(default=date(2026, 1, 1)),
    end_date: date = Query(default=date(2026, 1, 31)),
    cutoff: str = Query(default="d1_0900"),
):
    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be on or before end_date.",
        )
    if (end_date - start_date).days > 61:
        raise HTTPException(
            status_code=400,
            detail="Choose a decision-date range of 62 days or less.",
        )
    if cutoff not in CUTOFF_HOURS:
        raise HTTPException(
            status_code=400,
            detail="cutoff must be d2_1200, d1_0900, or d1_1500.",
        )

    # Input dates are decision dates. Delivery dates shift according to scenario.
    delivery_offset_days = 2 if cutoff == "d2_1200" else 1
    delivery_start = start_date + timedelta(days=delivery_offset_days)
    delivery_end = end_date + timedelta(days=delivery_offset_days)

    # Include publication history from before the earliest decision date.
    publish_from = datetime.combine(
        start_date - timedelta(days=2), time.min, tzinfo=timezone.utc
    )
    publish_to = datetime.combine(
        delivery_end + timedelta(days=1), time.min, tzinfo=timezone.utc
    )

    forecasts = fetch_dataset(
        (
            f"WINDFOR:v5:{publish_from.isoformat()}:"
            f"{publish_to.isoformat()}"
        ),
        "WINDFOR",
        {
            "publishDateTimeFrom": publish_from.isoformat().replace("+00:00", "Z"),
            "publishDateTimeTo": publish_to.isoformat().replace("+00:00", "Z"),
            "format": "json",
        },
    )

    actuals = fetch_dataset(
        f"FUELHH:WIND:{delivery_start.isoformat()}:{delivery_end.isoformat()}",
        "FUELHH",
        {
            "settlementDateFrom": delivery_start.isoformat(),
            "settlementDateTo": delivery_end.isoformat(),
            "fuelType": "WIND",
            "format": "json",
        },
    )

    # Actuals are half-hourly. Retain only exact hourly timestamps.
    actual_by_start = {}
    for row in actuals:
        try:
            start = parse_utc(row["startTime"])
            generation = float(row["generation"])
            if start.minute == 0 and start.second == 0:
                actual_by_start[start] = generation
        except (KeyError, TypeError, ValueError):
            continue

    # Choose the latest forecast published at or before the scenario deadline.
    selected_by_start = {}
    eligible_counts = {}
    forecast_rows_for_delivery = {}
    for row in forecasts:
        try:
            start = parse_utc(row["startTime"])
            published = parse_utc(row["publishTime"])
            generation = float(row["generation"])
        except (KeyError, TypeError, ValueError):
            continue

        if start not in actual_by_start:
            continue

        delivery_day = start.date()
        decision_day = delivery_day - timedelta(days=delivery_offset_days)
        if not start_date <= decision_day <= end_date:
            continue

        forecast_rows_for_delivery[start] = (
            forecast_rows_for_delivery.get(start, 0) + 1
        )
        delivery_midnight = datetime.combine(
            delivery_day, time.min, tzinfo=timezone.utc
        )
        decision_cutoff = delivery_midnight - timedelta(
            hours=CUTOFF_HOURS[cutoff]
        )
        if published > decision_cutoff:
            continue

        eligible_counts[start] = eligible_counts.get(start, 0) + 1
        previous = selected_by_start.get(start)
        if previous is None or published > previous["published"]:
            selected_by_start[start] = {
                "published": published,
                "forecast": generation,
                "decisionDate": decision_day.isoformat(),
            }

    records = []
    for start in sorted(selected_by_start):
        selected = selected_by_start[start]
        actual = actual_by_start[start]
        forecast = selected["forecast"]
        records.append(
            {
                "decisionDate": selected["decisionDate"],
                "deliveryDate": start.date().isoformat(),
                "deliveryStart": start.isoformat().replace("+00:00", "Z"),
                "publishedAt": selected["published"].isoformat().replace(
                    "+00:00", "Z"
                ),
                "forecast": forecast,
                "actual": actual,
                "error": forecast - actual,
            }
        )

    errors = [record["error"] for record in records]
    count = len(errors)
    if count:
        mae = sum(abs(error) for error in errors) / count
        rmse = sqrt(sum(error**2 for error in errors) / count)
        bias = sum(errors) / count
        mean_forecast = sum(record["forecast"] for record in records) / count
        mean_actual = sum(record["actual"] for record in records) / count
    else:
        mae = rmse = bias = None
        mean_forecast = mean_actual = None

    decision_days = (end_date - start_date).days + 1
    expected_hours = decision_days * 24
    matched_starts = set(selected_by_start)
    expected_delivery_hours = {
        datetime.combine(
            delivery_start + timedelta(days=day_offset),
            time(hour=hour),
            tzinfo=timezone.utc,
        )
        for day_offset in range(decision_days)
        for hour in range(24)
    }
    missing_timestamps = sorted(expected_delivery_hours - matched_starts)

    # Diagnostics distinguish "no forecast row for the hour" from "rows exist,
    # but all were published after the cutoff". They do not infer the cause.
    missing_details = []
    for start in missing_timestamps:
        delivery_midnight = datetime.combine(
            start.date(), time.min, tzinfo=timezone.utc
        )
        deadline = delivery_midnight - timedelta(hours=CUTOFF_HOURS[cutoff])
        rows_seen = forecast_rows_for_delivery.get(start, 0)
        eligible = eligible_counts.get(start, 0)
        if rows_seen == 0:
            reason = "no_forecast_rows_found_for_delivery_timestamp"
        elif eligible == 0:
            reason = "forecast_rows_found_but_none_met_cutoff"
        else:
            reason = "forecast_rows_found_but_no_match_selected"
        missing_details.append(
            {
                "deliveryStart": start.isoformat().replace("+00:00", "Z"),
                "decisionDate": (
                    start.date() - timedelta(days=delivery_offset_days)
                ).isoformat(),
                "cutoffAt": deadline.isoformat().replace("+00:00", "Z"),
                "forecastRowsFound": rows_seen,
                "eligibleForecastRows": eligible,
                "reason": reason,
            }
        )

    return {
        "source": "Elexon BMRS API",
        "decisionStartDate": start_date.isoformat(),
        "decisionEndDate": end_date.isoformat(),
        "deliveryStartDate": delivery_start.isoformat(),
        "deliveryEndDate": delivery_end.isoformat(),
        "cutoff": cutoff,
        "cutoffLabel": CUTOFF_LABELS[cutoff],
        "timezone": "UTC",
        "resolution": "Hourly matching timestamps only",
        "coverage": {
            "matchedHours": count,
            "expectedHours": expected_hours,
            "missingHours": max(expected_hours - count, 0),
            "coveragePercent": (
                round(count / expected_hours * 100, 2) if expected_hours else 0
            ),
        },
        "diagnostics": {
            "forecastRowsReceived": len(forecasts),
            "actualRowsReceived": len(actuals),
            "hourlyActualTimestamps": len(actual_by_start),
            "missingDeliveryHours": missing_details,
        },
        "note": (
            "The requested dates represent decision dates. Delivery dates are "
            "determined by the selected cutoff scenario. Only exact matching "
            "hourly forecast and actual timestamps are evaluated. Forecasts "
            "published after the cutoff are excluded. Missing forecast hours "
            "are not filled with later forecasts. Coverage counts matched "
            "forecast and actual hours against expected delivery hours."
        ),
        "metrics": {
            "count": count,
            "mae": round(mae, 2) if mae is not None else None,
            "rmse": round(rmse, 2) if rmse is not None else None,
            "bias": round(bias, 2) if bias is not None else None,
            "meanForecast": (
                round(mean_forecast, 2) if mean_forecast is not None else None
            ),
            "meanActual": (
                round(mean_actual, 2) if mean_actual is not None else None
            ),
        },
        "records": records,
    }
