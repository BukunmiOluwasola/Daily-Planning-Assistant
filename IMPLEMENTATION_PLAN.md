# Daily Planning Assistant — Detailed Implementation Plan

Source of truth for requirements: `DOCS/PRODUCT REQUIREMENTS DOCUMENT.md`.
Design preview: `design.html` (do not modify without a Task 2 review).
Working prototype: `app.html` (sample data only, no backend).

## Folder Audit (current state)

Tracked on `main`: PRD, `README.md`, `design.html`, `app.html`.
Intentionally untracked: `PRODUCT REQUIREMENT DOCUMENT SCREENSHOT.PNG`, `QUBATOR ONBOARDING.txt`.
Gaps: no database schema, no authentication, prototype has no backend.

## Technology Choices (locked for V1)

- **Framework:** Node.js + Express backend with a vanilla HTML/CSS/JavaScript frontend.
- **Database:** SQLite (local file database, better-sqlite3 / sqlite3 driver).
- **Authentication:** Local email + password with bcrypt hashing and server-side sessions. No third-party provider for V1.
- **File storage:** Not required for V1. Reserved for future attachment functionality.
- **Local run statement:** The app and database run locally for now. No cloud hosting, managed database, or external auth/file service is required for V1.
- **External AI service:** Google Gemini (free tier) for AI prioritisation via `POST /api/sessions/:id/ai-prioritise`. Optional: set `GEMINI_API_KEY` (git-ignored `.env`); without a key, or if the API call fails, the endpoint falls back to local rules and says so in its `provider` field.

## File Layout (created across phases)

- `server.js` — Express entry point (from Phase 4).
- `schema.sql` — full SQLite schema (Phase 3 output).
- `daily-planner.db` — local SQLite file, git-ignored, never committed.
- `db/db.js` — single SQLite connection helper.
- `routes/users.js` — signup/login/logout/me.
- `routes/sessions.js` — planning sessions + preferences + history.
- `routes/activities.js` — brain-dump parse, prioritise, edit, delete.
- `routes/plans.js` — plan generation + plan items.
- `routes/review.js` — focus sessions, statuses, review summary, carry-forward.
- `public/index.html`, `public/styles.css`, `public/app.js` — the served frontend (evolved from `app.html`).
- `DESIGN_SYSTEM.md` — tokens + component rules (Phase 1 output).

## Database Schema (Phase 3 detail)

- `users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, productive_period TEXT DEFAULT 'night', created_at TEXT NOT NULL)`
- `planning_sessions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), day TEXT NOT NULL CHECK(day IN ('today','tomorrow')), created_at TEXT NOT NULL)`
- `activities(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES planning_sessions(id), text TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','can-wait')), effort_min INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'Not Started', position INTEGER NOT NULL DEFAULT 0)`
- `plans(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL UNIQUE REFERENCES planning_sessions(id), created_at TEXT NOT NULL)`
- `plan_items(id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES plans(id), activity_id INTEGER NOT NULL REFERENCES activities(id), start_time TEXT NOT NULL, end_time TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)`
- `focus_sessions(id INTEGER PRIMARY KEY, activity_id INTEGER NOT NULL REFERENCES activities(id), started_at TEXT NOT NULL, ended_at TEXT, duration_min INTEGER NOT NULL DEFAULT 25)`

## API Routes (by phase)

- Phase 4: `POST /api/users/signup`, `POST /api/users/login`, `POST /api/users/logout`, `GET /api/me`, `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/:id`, `PUT /api/sessions/:id/preference`, `GET /api/history`.
- Phase 5: `POST /api/sessions/:id/parse` (brain dump → activities), `PATCH /api/activities/:id`, `DELETE /api/activities/:id`, `POST /api/sessions/:id/plan` (ordered time blocks + breaks), `PATCH /api/plan-items/:id`.
- Phase 6: `POST /api/focus` (start), `PATCH /api/focus/:id` (end), `PATCH /api/activities/:id/status`, `POST /api/sessions/:id/review` (summary), `POST /api/sessions/:id/carry-forward`.

## Phase 1 — Design System (from `design.html`)

- Lock tokens: Primary #2F3E9E, Primary-dark #232E78, Accent #E8A33D, Background #F6F4EE, Ink #1E2430, Success #2E7D5B, Muted #6B7280, Border #E5E1D8.
- Lock typography: Georgia serif display + Segoe UI system body; tight display headings, 16px body.
- Lock components: primary/ghost/accent buttons (primary keeps prominence rule: high contrast, subtle shadow, hover with stronger shadow + lift), text inputs, cards, priority pills (High/Medium/Can wait), plan timeline rows, focus timer, review controls.
- **Output:** `DESIGN_SYSTEM.md` with tokens and component rules; `design.html` stays the visual reference.
- **Check:** a style test page renders every token/component next to `design.html` with no visual mismatch.

## Phase 2 — Architectural Decisions

- Confirm Express + vanilla frontend, SQLite, local bcrypt sessions, no file storage in V1 (reserved for future attachments), all local.
- Record each decision with alternative considered and reason (SQLite-vs-PostgreSQL note already in PRD Section 15; add matching notes for auth and storage).
- **Output:** decision records in the PRD; no code yet.

## Phase 3 — Data Model

- Tables: users, planning_sessions, activities, plans, focus_sessions.
- **Output:** `schema.sql` plus a working local `.db` file created from it.
- **Check:** `schema.sql` runs clean on a fresh file; spot-check that foreign keys reject orphan rows.

## Phase 4 — Auth, Sessions, Schedule (FR-01, FR-02, FR-03, FR-14)

- Local sign-up/sign-in with sessions; today/tomorrow planning sessions; productive-period preference (morning/afternoon/evening/night); saved history views backed by SQLite.
- **Output:** working auth flow, session CRUD, preference setting, history page.
- **Check:** sign up → log out → log in; create today + tomorrow sessions; set night preference; history still lists them after server restart.

## Phase 5 — Plan Flow (FR-04–FR-09)

- Freeform brain dump; clarification questions; High / Medium / Can Wait prioritisation with short reasons; reality-check flag for unrealistic workloads; suggested plan with ordering, time blocks, and breaks; full user editing (add/remove/edit/reorder/retime).
- **Output:** brain-dump screen, clarification Q&A flow, prioritised list, editable persisted plan.
- **Check:** paste the 7-item sample dump → priorities assigned; 6+ items trigger the reality warning; plan shows time blocks + a break; edits survive page reload.

## Phase 6 — Execute and Review (FR-10–FR-13)

- Per-activity focus timer, break reminders (stand, stretch, eyes, water), status updates (Not Started / In Progress / Completed / Partially Completed / Carried Forward), daily review summary, carry-forward of unfinished items.
- **Output:** focus timer, break reminder, review screen, carry-forward action.
- **Check:** timer completes → break message appears; statuses save; review counts are correct; unfinished items carry into a new session.

## Phase 7 — Acceptance Pass and Hardening

- End-to-end local demo (plan → focus → review) checked against PRD Section 11 acceptance criteria and Section 12 conditions for success, using a local account and local database.
- **Output:** verified V1 demo, fixed defects, updated local-run notes (`npm install`, `npm start`).
- **Check:** walk the full PRD §11–§12 checklist top to bottom with zero cloud services running.

## Risks

- Scope creep (calendar/social-blocking/analytics are out of V1 per PRD §10) — defer on sight.
- Rule-based prioritisation is intentionally simple; the user stays decision-maker per the product principle.
- Single-user SQLite concurrency is fine for local V1; revisit only if multi-user hosting ever happens.
- Timer accuracy across reloads — persist focus start time in `focus_sessions`, never only in memory.
