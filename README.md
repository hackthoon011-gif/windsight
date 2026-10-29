# WindSight — Wind Forecast Accuracy Dashboard

WindSight is a web application for evaluating wind-power forecast performance against actual generation data. It combines a React dashboard with a Python FastAPI backend and data from the Elexon BMRS API.

## Features

- Interactive forecast-accuracy dashboard.
- Analysis over a user-selected date range and forecast decision cutoff.
- Forecast-versus-actual comparisons.
- Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and forecast bias.
- Coverage reporting so missing matched hours are visible.
- Backend health endpoint for service checks.
- SQLite caching to reduce repeated API requests.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, TanStack.
- **Backend:** Python, FastAPI, Uvicorn.
- **Data source:** Elexon BMRS API.
- **Cache:** SQLite.

## Project Structure

```text
.
├── backend/
│   ├── main.py
│   └── requirements.txt
├── public/
├── src/
├── package.json
├── package-lock.json
└── README.md
```

The local Python virtual environment, cache database, and environment-specific configuration are excluded from version control.

## Run Locally

### 1. Start the backend

Requires Python 3.11 or a compatible version supported by the dependencies.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Check backend health at:

`http://127.0.0.1:8000/health`

### 2. Start the frontend

Open a second terminal at the project root:

```powershell
npm install
npm run dev
```

Use the local URL printed by Vite. Configure the frontend API URL according to the project's existing environment configuration.

## API Example

```text
GET /api/accuracy?start_date=2026-01-01&end_date=2026-01-31&cutoff=d2_1200
```

The API evaluates forecast performance for the selected decision period and cutoff. Confirm the available query parameters and supported cutoff values in the backend implementation.

## Metrics and Interpretation

- **MAE:** Average absolute difference between forecast and actual generation.
- **RMSE:** Square root of the average squared difference; larger errors have greater influence.
- **Bias:** Average forecast minus actual generation. A positive value indicates overforecasting.
- **Coverage:** The proportion of expected hours for which a matched forecast and actual value are available.

Missing hours must be reported alongside accuracy metrics. Results should not be interpreted as representative of all hours when coverage is incomplete.

## Data and Methodology

Forecasts and actual generation are retrieved from Elexon BMRS datasets. Forecast eligibility depends on the selected decision cutoff and forecast publication timestamps. The implementation and cutoff definitions in `backend/main.py` are the source of truth for the evaluation methodology.

Data availability, publication timing, API changes, and missing observations can affect coverage and results. The analysis should not imply that unavailable observations have zero forecast error.

## Limitations

- Results depend on the available forecast and actual data.
- Incomplete coverage can affect how representative the reported metrics are.
- Forecast publication cutoffs materially affect which forecast is eligible for evaluation.
- The current implementation should be reviewed for API pagination, deployment configuration, and production error handling before production use.

## Status and Links

- **Public demo:** To be added after deployment is verified.
- **Public repository:** To be added after GitHub publication.
- **Demo video:** To be added after recording.

## Development Notes

Do not commit API credentials, `.env` files, virtual environments, generated cache databases, or other private configuration. Use an environment example file containing placeholders if configuration documentation is needed.

## AI Assistance

Disclose any AI-assisted development in accordance with the assignment requirements, describing the assistance actually used.
## Run with Docker

**Requirements:** Docker Desktop with Docker Compose.

From the project root, run:

```powershell
docker compose up --build -d
```

After both containers start, open:

- **Frontend dashboard:** http://localhost:8090
- **Backend API:** http://localhost:8000
- **Backend health check:** http://localhost:8000/health

The frontend and backend run as separate Docker services managed by Docker Compose. The backend uses a named Docker volume, `windsight_cache`, for its SQLite API cache.

To stop the application:

```powershell
docker compose down
```

## Live Deployment

WindSight is publicly deployed on Vercel.

- **Live application:** https://windsight-qpte.vercel.app
- **Backend API:** https://windsight-two.vercel.app
- **Backend health check:** https://windsight-two.vercel.app/health
- **GitHub repository:** https://github.com/hackthoon011-gif/windsight

The frontend and backend are deployed as separate Vercel projects. The frontend communicates with the backend through the `VITE_API_BASE_URL` configuration, and the backend allows the frontend origin through `WINDSIGHT_CORS_ORIGINS`.