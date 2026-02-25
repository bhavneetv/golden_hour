# AI Hospital - Golden Hour Triage System

AI Hospital is a full-stack emergency triage prototype built for rapid decision support during the "golden hour".  
It combines rule-based triage, lightweight AI prediction, explainability, live referral intelligence, and a real-time operations dashboard.

## What this project does

- Accepts patient vitals and symptoms.
- Calculates triage risk and category (`RED`, `ORANGE`, `YELLOW`, `GREEN`).
- Predicts likely next clinical movement (`ICU_ADMISSION`, `IN_TREATMENT`, `REFERRED`, `OBSERVATION`, `DISCHARGED`).
- Tracks patient queue and history in SQLite.
- Recommends nearest referral hospital using live map, routing, and bed-capacity signals.
- Generates clinical recommendations using AI API with rule-engine fallback.

## Tech stack

- Frontend: React + Vite + Recharts
- Backend: FastAPI (Python)
- Database: SQLite (`backend/triage.db`)
- External integrations:
  - OpenStreetMap Nominatim + Overpass
  - OSRM routing API
  - US HHS hospital capacity dataset (`healthdata.gov`)
  - India synthetic hospital-capacity priors (local seed dataset)
  - Pollinations text API for recommendation generation

## Project structure

```text
ai-hospital/
  backend/
    main.py         # FastAPI app, triage logic, AI prediction, referral logic
    triage.db       # SQLite database (auto-used/updated at runtime)
  src/
    App.jsx         # Full React UI (dashboard, queue, history, triage form)
    main.jsx
    index.css
  vite.config.js    # /api -> http://localhost:8000 proxy
```

## Full process flow

1. Staff enters patient details in `Add Patient`.
2. Frontend validates ranges and sends `POST /triage`.
3. Backend validates input again and normalizes symptoms.
4. Risk score is computed from critical thresholds:
   - SpO2 `< 90`
   - Systolic BP `< 90`
   - Heart rate `> 120`
   - Temperature `> 38.5`
   - Age `> 65`
5. Risk score is mapped to triage color:
   - `80+` => `RED`
   - `60-79` => `ORANGE`
   - `40-59` => `YELLOW`
   - `<40` => `GREEN`
6. AI module predicts next move and priority.
7. Record is stored in SQLite with timestamp and status (`WAITING` initially).
8. Dashboard/Queue fetch latest records via `GET /queue`.
9. History view groups timeline data using `GET /patients/{patient_id}/history`.
10. Referral card uses location to find a target hospital with capacity + travel tradeoff.

## How AI works in this project

### 1) Risk scoring engine (deterministic)

- Uses threshold-based medical heuristics for immediate triage risk.
- Outputs:
  - `risk_score` (0-100)
  - `deterioration_probability_60min` (risk/100)
  - `triage_category`
  - `action` (`IMMEDIATE_ATTENTION` or `MONITOR`)

### 2) Next-move predictor (lightweight probabilistic model)

- Uses a Naive Bayes-style classifier implemented in `backend/main.py`.
- Feature set includes:
  - risk buckets (`>=80`, `60-79`, `40-59`)
  - low SpO2
  - low BP
  - high HR
  - high temperature
  - elderly flag
  - rural flag
  - triage flags (`RED`/`ORANGE`)
- Predicts probability distribution over:
  - `ICU_ADMISSION`
  - `IN_TREATMENT`
  - `REFERRED`
  - `OBSERVATION`
  - `DISCHARGED`
- Returns:
  - top predicted move
  - confidence band (`LOW/MEDIUM/HIGH`)
  - priority band (`P1..P4`)
  - 24h trajectory (`WORSENING/STABLE/IMPROVING`)

### 3) Anomaly insight engine

- Computes `anomaly_score` and `anomaly_level`.
- Adds `ai_watchouts` text alerts for dangerous patterns (oxygenation drop, hypotension trend, etc.).

### 4) Clinical recommendations

- First tries Pollinations text API for 3 short recommendations.
- If unavailable/weak response, falls back to rule-based recommendations.
- Response shows source: `pollinations_ai` or `rule_engine`.

### 5) Explainability + fairness

- `GET /triage/explain` returns top risk factors from current vitals.
- `GET /triage/fairness` returns current fairness check payload.

## Datasets used

### Internal datasets

1. Synthetic seed outcome dataset (`SEED_OUTCOME_DATA` in backend code)
   - 20 labeled samples
   - Fields: age, rural, vitals, risk_score, outcome label
   - Purpose: bootstrap the next-move model before enough local records exist

2. Expanded synthetic clinical dataset (`SEED_OUTCOME_DATA_EXPANDED`)
   - Additional labeled samples including symptom patterns
   - Improves training coverage for respiratory, cardiac, neuro, trauma, and dehydration scenarios

3. Runtime local dataset (SQLite `triage_records`)
   - All submitted triage records are saved
   - Used as incremental training signal for prediction
   - Supports queue + history analytics

### External/public datasets and APIs

1. HHS facility capacity dataset (US)
   - Source: `https://healthdata.gov/resource/anag-cw7u.json`
   - Used for inpatient and ICU bed availability estimation

2. OpenStreetMap Nominatim
   - Used for geocoding location text to coordinates
   - Also fallback hospital discovery

3. OpenStreetMap Overpass
   - Used to fetch nearby hospitals around coordinates

4. OSRM routing API
   - Computes travel time and travel distance from source location to candidate hospitals

5. India hospital capacity priors (synthetic internal dataset)
   - Used for India referral scoring when HHS (US-only) is not applicable

6. Pollinations text API
   - Used to generate short AI clinical recommendation bullets

## Referral recommendation logic

Hospital recommendation score combines:

- ICU bed availability (high weight)
- Inpatient bed availability (medium weight)
- Travel time (negative weight)

Best score is selected as recommended referral center.  
For India, the system combines map/routing with internal India capacity priors.  
For other countries, the system falls back to nearest/fastest reachable hospital using map + routing.

## API summary

- `GET /health`
- `POST /triage`
- `GET /triage/explain`
- `GET /triage/fairness`
- `GET /referral/recommend`
- `GET /queue`
- `PATCH /queue/{patient_id}/status`
- `GET /patients/{patient_id}/history`
- `GET /patients/{patient_id}/next-move-prediction`
- `GET /recommendations/clinical`
- `GET /analytics/summary`

## Setup and run

### 1) Frontend

```bash
npm install
npm run dev
```

Vite frontend runs on `http://localhost:5173` by default.

### 2) Backend

Create and activate a Python environment, then install:

```bash
pip install fastapi "uvicorn[standard]" pydantic
```

Run API server:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs on `http://localhost:8000`.

### 3) Frontend-backend connection

- Default frontend base URL is `/api`.
- `vite.config.js` proxies `/api/*` -> `http://localhost:8000/*`.
- Optional env override:
  - `VITE_API_BASE_URL=http://localhost:8000`

## Impact on the world

This system can help emergency teams by:

- Reducing triage decision time during high patient load.
- Improving attention to critical deterioration signals.
- Supporting rural and resource-limited transfers through data-driven referral.
- Increasing transparency via explainability outputs.
- Creating an auditable patient timeline for continuous quality improvement.

## Current prototype notes

- The `Analytics` page now uses live aggregates from the `triage_records` database via `GET /analytics/summary`.
- Live queue, triage, history, explainability, referral, and recommendations are backed by real API calls.

## Important limitations

- This is a prototype decision-support system, not a certified medical device.
- Predictions are based on lightweight statistical logic and local records, not deep clinical validation.
- External APIs can fail or rate-limit; recommendation fallbacks are implemented but not perfect.
- Data governance, security hardening, and clinical validation are required before real deployment.

## Suggested production upgrades

1. Add authentication, RBAC, and audit logs.
2. Encrypt data at rest and in transit; add HIPAA-aligned controls.
3. Replace lightweight model with validated ML pipeline and monitoring.
4. Add unit/integration tests and CI checks.
5. Integrate with hospital HIS/EMR systems and real-time device feeds.
