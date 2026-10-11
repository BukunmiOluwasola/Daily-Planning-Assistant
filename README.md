# Daily Planning Assistant

An AI-powered daily planning assistant that helps you turn an unorganised list of intentions into a realistic, flexible plan — and follow through on it.

The AI recommends. The user decides.

## Problem

People often know what they want to do but struggle to turn it into a realistic plan. They may not know what to do first, plan more than they can complete, get distracted, or lose track of their intentions.

Most planning tools also assume everyone is productive during conventional daytime hours, which does not fit night workers, remote workers across time zones, or people with flexible schedules.

## Who It Is For

Everyday individuals who want help planning and following through, including:

- Students
- Employees
- Remote workers
- Freelancers
- Entrepreneurs
- People with flexible schedules
- People who prefer working at night

## Core User Journey

Brain Dump → Understand → Prioritise → Reality Check → Plan → Adjust → Focus → Break → Review

1. **Brain Dump:** Enter everything on your mind in freeform natural language.
2. **Understand:** AI asks concise clarification questions on importance, urgency, deadlines, effort, must-do-today items, and dependencies.
3. **Prioritise:** AI organises activities into High / Medium / Low priority with short explanations.
4. **Reality Check:** AI flags unrealistic workloads and recommends what to focus on first.
5. **Plan:** AI generates a suggested plan with ordering, approximate time blocks, and breaks around your productive period.
6. **Adjust:** You edit, add, remove, reorder, or retime activities.
7. **Focus:** Start a focus session for one activity with a simple timer.
8. **Break:** Take short breaks after focused work.
9. **Review:** Mark activities as Completed / Partially Completed / Not Completed and carry unfinished items forward.

Planning the next day the night before is the primary use case. Planning for today is also supported.

## V1 Features

- Account creation and sign-in
- Today / tomorrow planning sessions
- Freeform brain dump
- AI clarification questions
- AI prioritisation with explanations
- Realistic workload assessment
- AI-generated plan with time blocks and breaks
- Flexible productive periods (morning, afternoon, evening, night)
- User plan adjustments
- Focus timer
- Break reminders
- Activity status tracking (Not Started, In Progress, Completed, Partially Completed, Carried Forward)
- Daily review summary
- Saved planning history

## Principle

Help users organise their lives without making them feel controlled. The goal is not to maximise tasks completed, but to help users focus on what matters and make a realistic plan around it.

## Run Locally (V1)

Prerequisites: Node.js 24+ (SQLite is included via the app's dependencies — no database server needed).

```powershell
npm install
npm start
```

Then open `http://localhost:3000`. Data is stored in the git-ignored `daily-planner.db` file next to the server.

Optional AI prioritisation (free tier): create a `.env` file with `GEMINI_API_KEY=your-key` (never committed) and restart. Without a key the app uses local rules and says so.

Hosted runs (e.g. Netlify) use Postgres via `DATABASE_URL` instead of the local SQLite file; the app picks the backend automatically and the API is unchanged.

## Product Notes (polish pass)

- Landing page (`/` when signed out) → **Plan my day** CTA → sign-in / create-account screen → app. Signed-in users land straight in the app.
- Auth: existing emails are guided to sign in (never auto-logged-in); wrong passwords show a clear sign-in error. Sign-ins persist in SQLite across server restarts (`SESSION_SECRET` is set in the git-ignored `.env`).
- Reminders, honestly: focus timers and break messages are **in-app** and always work. **Browser notifications** are opt-in (permission is requested when you start your first focus, to explain the purpose) and fire when a focus session ends. There are **no scheduled or background notifications** — nothing runs when the app is closed.
- Design reference `design.html` is frozen; the app follows `DESIGN_SYSTEM.md`.
- Time display: choose 12-hour (AM/PM) or 24-hour in the Planning session card; saved task times stay canonical 24h, so switching formats never changes them. 12:00 AM is midnight, 12:00 PM is noon.
- Time zone: times are shown in your device's local zone (auto-detected, DST-aware); stored instants don't move if the zone changes, only their display does. Day plans stay on their local calendar day.
