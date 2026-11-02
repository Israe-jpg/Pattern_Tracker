# Pattern Tracker

Personal full-stack health tracker: daily logs in PostgreSQL, Python analysis of trends and patterns, results shown in a React Native app. Runs locally; it is not deployed.

![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react)
![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)
![Flask](https://img.shields.io/badge/Flask-2.3-black?logo=flask)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-psycopg-4169E1?logo=postgresql)
![Python](https://img.shields.io/badge/Python-pandas%20%7C%20numpy%20%7C%20scipy-3776AB?logo=python)

The Expo display name in `frontend/app.config.js` is **Trackt**.

## At a glance

- **Problem:** Health notes are hard to reuse if they stay as unstructured text. This app stores each day as structured fields (numbers, choices, times, yes/no) so the same data can be compared over time.
- **How data is stored:** A user owns one or more trackers (Period, Workout, Symptom, or a custom category). Each day is one JSON row in `tracking_data`, keyed by tracker and `entry_date`. Cycle dates live in `period_cycles`.
- **What is analysed:** Descriptive stats and linear trends, week/month/baseline comparisons, correlations between fields, recurring calendar patterns (weekday, time of month, streaks), and for the period tracker: cycle length, regularity, and prediction error.
- **What the user sees:** A calendar of logged days (and cycle phases on the period tracker), plus an Insights panel with charts, comparison summaries, correlation lines, and pattern cards.
- **Scope:** Local development project (Flask on port 5000 + Expo). No hosted demo.

## Screenshots

<p align="center">
  <img src="docs/screenshots/login.jpeg" width="180" alt="Sign in" />
  <img src="docs/screenshots/period-calendar.jpeg" width="180" alt="Period calendar" />
  <img src="docs/screenshots/comparisons-correlations.jpeg" width="180" alt="Comparisons and correlations" />
  <img src="docs/screenshots/patterns.jpeg" width="180" alt="Patterns" />
  <img src="docs/screenshots/log-sleep-details.jpeg" width="180" alt="Patterns" />
  <img src="docs/screenshots/sleep-charts.jpeg" width="180" alt="Patterns" />
  <img src="docs/screenshots/cycle-charts.jpeg" width="180" alt="Patterns" />
  
</p>

## Features

**App (Expo / React Native)**  
Register, login, JWT refresh, profile (gender, optional height/weight/DOB, metric or imperial). Home calendar, Insights (Overview / Cycles / Fields), daily log form, period setup, custom trackers, field/option management, PDF export of form config (`expo-print`). Token refresh is handled in the Axios interceptor.

**Backend (Flask)**  
REST API under `/api`. JWT access (1 hour) and rotating refresh (default 90 days). PostgreSQL via SQLAlchemy. Tracker schemas from JSON config plus per-user overrides. CSV bulk import/export of tracking rows. Health check at `GET /api/health`.

**Data analysis and visualization**  
Python services compute stats, trends, comparisons, correlations, and patterns; a sufficiency layer chooses which insight type is eligible given entry count and date span. The mobile Insights UI draws charts from JSON (`react-native-chart-kit`, SVG donuts, custom bars). The API also returns matplotlib PNG charts on dedicated chart routes (used from Postman; the mobile client does not call those PNG URLs).

## Tech stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Mobile | Expo ~54.0.0, React 19.1.0, React Native 0.81.5 | App shell, navigation, forms |
| Mobile charts | react-native-chart-kit 6.12.0, react-native-svg 15.12.1 | Line, bar, and donut charts in Insights |
| API | Flask 2.3.3, Flask-JWT-Extended 4.5.3, Flask-Cors 4.0.0 | HTTP API and auth |
| Persistence | Flask-SQLAlchemy 3.0.5, Flask-Migrate 4.0.5, psycopg2-binary 2.9.10 | PostgreSQL models and migrations |
| Analysis | pandas 2.3.3, numpy 2.3.5, scipy 1.16.3 | Stats, regression, correlations |
| Server charts | matplotlib 3.10.7, seaborn 0.13.2 | PNG chart endpoints |
| Serve (local / Procfile) | `python run.py` (port 5000); gunicorn 21.2.0 in `backend/Procfile` | Process entrypoints — no live host |

## Architecture

The app sends JSON to Flask. Flask reads and writes PostgreSQL. Analysis services load `tracking_data` (and `period_cycles` when needed), compute results, and return JSON to Insights. Chart PNG routes run the same analyses through matplotlib.

```mermaid
flowchart LR
  RN[React Native / Expo] -->|JSON REST + JWT| API[Flask /api]
  API --> DB[(PostgreSQL)]
  API --> A[Analytics / comparison / correlation / pattern / period services]
  A --> DB
  A -->|JSON insights| RN
  A -->|PNG on /chart routes| API
```

## Project structure

<details>
<summary>Folder tree (generated from the repo; excludes node_modules, venv, .git, __pycache__)</summary>

```
health_tracker/
├── README.md
├── docs/screenshots/          # README images
├── postman/                   # API collection
├── frontend/
│   ├── App.js                 # Expo entry
│   ├── app.config.js          # App name Trackt, extra env
│   ├── package.json
│   ├── assets/                # Icons, splash, logo
│   └── src/
│       ├── screens/           # Auth, home, log, profile, calendars, custom tracker
│       ├── components/        # Calendar, insights, forms, drawer
│       ├── context/           # Auth and active tracker
│       ├── services/          # Axios clients
│       ├── hooks/             # Tracker data loading
│       ├── navigation/
│       ├── utils/
│       └── constants/         # Colors, API paths
└── backend/
    ├── run.py                 # Flask on 0.0.0.0:5000
    ├── config.py              # Env-based Flask/JWT/DB config
    ├── requirements.txt
    ├── Procfile               # gunicorn run:app
    ├── sample_*.csv           # Sample imports
    ├── scripts/               # Period fields setup, sleep seed
    ├── migrations/            # Alembic revisions
    └── app/
        ├── routes/            # auth, trackers, data_tracking
        ├── models/            # SQLAlchemy tables
        ├── services/          # Tracking + analysis
        ├── schemas/           # Marshmallow
        ├── config/            # tracker_schemas.json
        └── utils/             # Cycle math, unit conversion
```

</details>

## Data model

```mermaid
erDiagram
  users ||--o{ trackers : owns
  tracker_categories ||--o{ trackers : type
  tracker_categories ||--o{ tracker_fields : defines
  tracker_fields ||--o{ tracker_fields : parent
  tracker_fields ||--o{ field_options : has
  trackers ||--o{ tracking_data : logs
  trackers ||--o{ period_cycles : cycles
  trackers ||--o{ tracker_user_fields : custom_fields
  trackers ||--o{ tracker_field_overrides : field_overrides
  trackers ||--o{ tracker_option_overrides : option_overrides
  tracker_user_fields ||--o{ field_options : has
```

| Table | Role (columns from models) |
| --- | --- |
| `users` | id, username, email, password_hash, first/last name, date_of_birth, gender, height, weight, unit_system, created_at, is_active |
| `tracker_categories` | id, name, data_schema (JSON), created_at, is_active |
| `trackers` | id, user_id, category_id, is_default, settings (JSON), created_at |
| `tracker_fields` | category-level fields: name, parent, path, labels, context, order, group, is_active |
| `tracker_user_fields` | per-tracker custom fields |
| `field_options` | option_name, option_type (rating, choices, yes_no, number, text, notes, time), validation, choices JSON |
| `tracker_field_overrides` / `tracker_option_overrides` | per-tracker hide/rename/reorder |
| `tracking_data` | tracker_id, entry_date, data (JSON payload), ai_insights (JSON, unused by current AI stubs), created_at |
| `period_cycles` | cycle and period start/end, cycle_length, period_length, predicted ovulation and next period |

Prebuilt categories from code: **Period Tracker**, **Workout Tracker**, **Symptom Tracker**. Shared **baseline** fields (mood, energy, sleep, stress, and related) are copied onto those categories from `tracker_schemas.json`. Users can also create custom categories.

## Data analysis and visualization

**In business terms:** After enough days are logged, the app answers: is this metric going up or down; is this week different from last week or from a longer baseline; which answers tend to appear together; does a value cluster on certain weekdays or parts of the month; for cycles, how regular they are and how far predictions missed.

**In technical terms (implemented services):**

- **Sufficiency** (`analytics_data_sufficiency_system.py`): maps entry count and day span to insight types (e.g. trend line needs 14+ entries; simple correlation 10+; cyclical detection 21+).
- **Descriptive stats and trends** (`analytics_service.py`): mean, median, std, quartiles; numeric trend via linear regression (`numpy` / `scipy.stats`); categorical frequency analysis. Unified analyzer picks numeric vs categorical from the field type.
- **Comparisons** (`comparison_service.py`): current week vs previous week; current month vs previous month; current month vs a multi-month baseline (`comparison_type=general`, default 5 months). Period tracker: last finished cycle vs previous cycle and vs average cycle.
- **Correlations** (`correlation_service.py`): needs ≥10 entries and ≥2 fields (notes excluded). Dual “when A then B”, triple “when A and B then C”, and within-field option pairs. Strength bands 0.3 / 0.5 / 0.7; p-value threshold 0.05. Field-pair analysis can add a 1-day lag. `analyze_all_correlations` returns the top 3.
- **Patterns** (`pattern_recognition_service.py`): needs ≥10 points. Day-of-week, time-of-month (early/mid/late), streaks, and cycle-phase patterns on the period tracker. Min 2 occurrences and 60% consistency by default.
- **Period analytics** (`period_analytics_service.py`): cycle lengths from period starts; regularity score `max(0, 100 - std_dev * 10)` with level labels from std; prediction error from stored predicted vs actual next-period dates; calendar grid with phases.

**Charts in the app:** Insights builds line charts for numeric series, donuts/bars for category mix, comparison/correlation cards, expandable pattern charts, and period cycle length / period length charts — from JSON (`getCycleAnalysis`, `getGeneralAnalysis`, `getCompare`, `getCorrelations`, `getPatternSummary`, plus calendar endpoints).

**Charts on the API (PNG):** `GET .../chart`, `time-evolution-chart`, `comparison-chart`, `correlation-chart`, `pattern-chart` (matplotlib). Types documented on the unified chart route: bar / pie / horizontal_bar (categorical); scatter / box_plot (numeric).

## API overview

Base path: `http://localhost:5000/api`. Most tracker and data routes require `Authorization: Bearer <access_token>`.

<details>
<summary>Endpoints (method, path, purpose) — from route files</summary>

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| POST | `/auth/register` | Create user |
| POST | `/auth/login` | Access + refresh tokens |
| POST | `/auth/refresh` | Rotate tokens |
| POST | `/auth/logout` | Logout |
| GET | `/auth/profile` | Current user |
| POST | `/auth/obtain-user-sex-info` | Set gender |
| POST | `/auth/obtain-optional-user-info` | Profile extras / units |
| DELETE | `/auth/delete-account` | Delete account |
| GET | `/auth/delete-account-page` | HTML delete-account page |
| POST | `/trackers/setup-default-trackers` | Create default trackers by gender |
| GET | `/trackers/my-trackers` | List trackers |
| GET | `/trackers/<id>/tracker-details` | Tracker details |
| GET/PUT | `/trackers/<id>/tracker-settings` | Settings (period config) |
| PATCH | `/trackers/<id>/change-tracker-name` | Rename |
| PUT | `/trackers/update-default-tracker/<id>` | Set default |
| DELETE | `/trackers/delete-tracker/<id>` | Delete tracker |
| POST | `/trackers/create-custom-category` | Custom tracker |
| GET | `/trackers/<id>/form-schema` | Log form schema |
| GET | `/trackers/<id>/management-schema` | Editor schema |
| GET | `/trackers/<id>/complete-schema` | Full schema |
| POST | `/trackers/<id>/create-new-field` | Add field |
| GET/PATCH/DELETE | `/trackers/<fieldId>/field-details`, `update-field-display-label`, `update-field-help-text`, `update-field-order`, `toggle-field-active-status`, `delete-field` | Field CRUD |
| POST/GET | `/trackers/<fieldId>/create-new-option`, `options` | Options |
| GET/PUT/PATCH/DELETE | `/trackers/<optionId>/option-details`, `update-option-info`, `update-option-order`, `toggle-option-active-status`, `delete-option` | Option CRUD |
| DELETE | `/trackers/<fieldId>/bulk-delete-options` | Bulk delete options |
| POST | `/trackers/<id>/rebuild-schema` | Rebuild schema |
| GET/POST | `/trackers/<id>/export-config`, `import-config` | Config export/import |
| GET | `/trackers/option-types` | Option type list |
| POST/GET/PUT/DELETE | `/trackers/<id>/log-period`, `current-cycle`, `update-cycle`, `recalculate-cycles`, `cycles-history`, `cycles/<cycleId>`, `periods/bulk-update` | Period cycles |
| GET/POST/PUT/DELETE | `/data-tracking/<id>/get-all-tracking-data`, `save-tracking-data`, `add-tracking-data`, `update-tracking-data`, `get-tracking-data-by-date`, `get-tracking-data-range`, `bulk-delete-tracking-data`, `bulk-create-tracking-data`, `export-tracking-data` | Entries |
| GET | `/data-tracking/<id>/get-insights-for-field`, `get-all-insights`, `analyze`, `time-evolution-analysis`, `general-tracker-analysis` | Analysis |
| GET | `/data-tracking/<id>/compare`, `compare-custom` | Comparisons |
| GET | `/data-tracking/<id>/correlations`, `correlations/field`, `correlations/specific` | Correlations |
| GET | `/data-tracking/<id>/detect-patterns`, `pattern-summary`, `recurring-symptom-patterns` | Patterns |
| GET | `/data-tracking/<id>/general-cycle-analysis`, `symptoms-by-phase` | Period analysis |
| GET | `/data-tracking/<id>/calendar`, `calendar/overview`, `tracker-calendar`, `tracker-calendar/overview` | Calendars |
| GET | `/data-tracking/<id>/chart`, `time-evolution-chart`, `comparison-chart`, `correlation-chart`, `pattern-chart` | PNG charts |

Full examples: [postman/README.md](postman/README.md).

</details>

## Getting started

Personal project. Run the database, API, and Expo app on your machine. Phone and computer must share a Wi-Fi network for a physical device.

**Prerequisites:** Python 3 and pip; Node.js and npm; PostgreSQL; Expo Go or an iOS/Android simulator. TODO: confirm exact Python and Node versions used in development.

### Backend and database

```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` (names only; never commit real values):

```env
FLASK_ENV=development
SECRET_KEY=
JWT_SECRET_KEY=
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/health_tracker
# optional
JWT_REFRESH_TOKEN_EXPIRES_DAYS=90
# used only if you run the TestingConfig
TEST_DATABASE_URL=
```

Create the PostgreSQL database named in `DATABASE_URL`, then:

```bash
cd backend
# Flask-Migrate reads DATABASE_URL from config.py
# TODO: confirm FLASK_APP if `flask db` cannot locate the app (there is no .flaskenv in the repo)
set FLASK_APP=run.py
flask db upgrade
python run.py
```

`run.py` binds `0.0.0.0:5000`. Check `GET http://localhost:5000/api/health`. On startup the app tries to initialize Workout, Symptom, and Period categories from `tracker_schemas.json`.

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
COMPUTER_IP=
PRODUCTION_API_URL=
```

`COMPUTER_IP` is required for iOS/Android in development (`frontend/src/constants/config.js`). Web uses `http://localhost:5000/api`. `PRODUCTION_API_URL` is required only for production builds; this repo is not deployed.

```bash
npm start
```

Then scan the QR code, or `npm run android` / `npm run ios` / `npm run web`.

Optional CSV samples in `backend/` can be imported through `POST /data-tracking/<id>/bulk-create-tracking-data`.

## Limitations and next steps

- Not deployed. `Procfile` exists but there is no live URL or production environment documented in-repo.
- No test files found. `pytest` and `Flask-Testing` are in `requirements.txt` but unused in the tree.
- `TrackerDetailScreen` is a placeholder (“coming soon”).
- “Forgot password?” on Login is a control with no handler; there is no reset endpoint.
- `backend/app/routes/ai.py` and `ai_service.py` are empty. `tracking_data.ai_insights` is not filled by a working pipeline.
- Pattern class comments mention sequential patterns; implemented detectors are weekday, time-of-month, streaks, and cycle-phase.
- Mobile Insights does not request the matplotlib PNG routes.
- Access tokens expire after one hour; the app refreshes via `/auth/refresh`.

## Author

Israe Guennouni, Casablanca  
[linkedin.com/in/israe-guennouni](https://www.linkedin.com/in/israe-guennouni) · [guen.israe@gmail.com](mailto:guen.israe@gmail.com)
