# VozLook InterviewAI

**Practice. Perform. Improve.**
An AI mock-interview platform by **VozLook Studios** — a working full-stack application, not a prototype.

Upload a résumé, add a job description, run a text / voice / video interview with an AI interviewer that asks
follow-ups based on your answers, then read a transparent, question-by-question practice report with a downloadable
PDF, progress tracking and an AI improvement coach.

> **Responsible AI.** Every score is a practice signal for self-improvement. The product never predicts hiring
> outcomes and never assesses personality, honesty, intelligence or mental state. Video observations are optional,
> computed on-device from brightness and motion only, and are labelled as rough delivery signals.

---

## Feature map

| Area | What actually works |
| --- | --- |
| Auth | Signup, login, logout, forgot-password, reset-password, change-password, session persistence, protected routes, account deletion (password-confirmed) |
| Onboarding | Four-step wizard (name → target role → experience level → preferred mode) shown once, then never again |
| Résumé | PDF / DOCX / TXT / MD upload **and** paste-text fallback; real text extraction, then structured analysis (skills, languages, frameworks, tools, projects, experience, internships, education, certifications, achievements, links) |
| Job description | Paste or file upload; extracted required skills, preferred skills, responsibilities, technical/soft requirements, seniority, domain, keywords |
| Interview setup | Type (technical / HR / behavioral / mixed), difficulty (easy → adaptive), mode (text / voice / video), 5–20 questions, adaptive follow-ups toggle, focus areas, role + company |
| Interview engine | Server-side state machine (`IDLE → PREPARING → QUESTIONING → ANSWERING → PROCESSING → FOLLOW_UP → COMPLETED`), idempotent answer submission, resumable after refresh, per-question feedback, skip handling, finish-early flow |
| Voice mode | Web Speech API transcript with live interim results, optional MediaRecorder capture, TTS interviewer voice, graceful fallback to typing when speech APIs are unavailable or the mic is denied |
| Video mode | Camera preview with mic/camera toggles and on-device brightness/motion observations only; degrade to voice/text on any failure |
| Evaluation | Relevance, technical accuracy, completeness, clarity, structure, problem solving, confidence + expected-topic coverage with evidence |
| Report | 12 sections: overall, "How scoring works", strengths, weaknesses, recommended topics, question-by-question review, 3-week improvement plan, recommendations, interview context, next steps, disclaimer, downloadable branded PDF |
| History | Filters by role, type, status and date range; view report, continue in-progress interview, download PDF, delete |
| Progress | Real trend chart across completed interviews (per-metric toggle), averages by interview type, recurring weak topics, methodology note |
| Coach | Conversational coach grounded in your résumé, target role, past evaluations and weak topics, with practice questions |
| Profile / Settings | Name, avatar upload, target role/company, experience level, preferred mode; change password, platform status, delete account |

---

## Tech stack

- **Frontend** — React 18 + TypeScript + Vite, Tailwind CSS design system, Framer Motion, Lucide icons, Recharts.
- **Backend** — Node + Express (TypeScript, ESM), Zod validation, JWT sessions, bcrypt password hashing.
- **Database** — Supabase Postgres **or** local SQLite. The SQLite driver is `sql.js` (pure WASM, no native build).
- **AI** — Gemini (`gemini-2.5-flash`) through secure server-side calls when `GEMINI_API_KEY` is set, with a
  deterministic built-in analysis engine as the always-available fallback.
- **Storage** — Supabase Storage when configured, local disk otherwise, served through an owner-checked file route.
- **PDF** — `pdfkit` report generation; `pdf-parse` / `mammoth` for résumé and job-description extraction.

### Hybrid runtime

The app is designed to run **today, with no cloud keys**, and to activate cloud services automatically when keys exist.

| Component | Without keys (default) | With keys |
| --- | --- | --- |
| Data | `DATA_MODE=auto` → SQLite at `server/data/vozlook.db` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → Supabase Postgres |
| Auth | Server-issued JWT sessions (bcrypt) | Supabase Auth (`auth_provider='supabase'`); server validates the Supabase token |
| AI | `VozLook local analysis engine` | Gemini via `GEMINI_API_KEY`, with automatic fallback to the local engine on any provider error |
| Files | `server/data/uploads` behind `/api/files/:key` | Supabase Storage buckets (`documents`, `media`), same owner-checked route |

Nothing in the UI changes between modes: `/api/meta` reports the active store, storage driver and AI engine, and the
Settings page displays them.

---

## Quick start

```bash
# 1. install (npm workspaces: client + server)
npm install

# 2. run API and web app together
npm run dev            # API → http://localhost:8787 · web → http://localhost:5173
```

Open <http://localhost:5173>, create an account, complete onboarding, upload a résumé, add a job description and
start an interview. `npm run dev:api` and `npm run dev:web` run the two halves separately.

Other scripts:

```bash
npm run build       # typecheck + production build of both workspaces
npm start           # serve the built app (API serves client/dist)
npm run typecheck   # tsc for server and client
npm test            # 42-check end-to-end API test suite (isolated temp database)
```

---

## Environment variables

Copy `.env.example` to `.env` (repo root) or `server/.env` — the server resolves `process.env` → `server/.env` → root `.env`.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables the Gemini engine. **Server-side only — never exposed to the browser.** |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash`. |
| `AI_ENGINE` | `local` forces the built-in engine even when a key is present (useful for tests). |
| `DATA_MODE` | `auto` (default) → Supabase when configured, else SQLite. `sqlite` / `supabase` force a driver. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access (service role stays on the server). |
| `PORT`, `HOST` | API bind address (default `8787`, `0.0.0.0`). |
| `JWT_SECRET` | Session signing key. Generated once and persisted in dev if unset. |
| `SESSION_DAYS` | Session lifetime (default 30). |
| `MAX_UPLOAD_MB` | Upload cap (default 10). |
| `CORS_ORIGINS` | Comma-separated allow-list; empty means same-origin only (the dev server proxies `/api`). |
| `EXPOSE_RESET_LINK` | Development convenience: returns the generated reset link in the API response. Disable in production. |
| `DATA_DIR` | Overrides the SQLite/upload directory (used by the test suite). |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **Optional, client-side.** When present, Supabase Auth is used for signup/login. The anon key is public by design; the service-role key is never sent to the browser. |
| `VITE_DEMO_MODE` | Only reserved for an isolated demo build. Never affects the production data path — production always reads and writes the authenticated user's real rows. |
| `VITE_API_TARGET` | Dev proxy target when the API is not on `127.0.0.1:8787`. |

**Security rules enforced in code:** API keys are read only in `server/src/env.ts`; the browser bundle contains no
provider secrets; every data route derives the user from the verified session token and filters by `user_id`
(never trusting a client-supplied id); `/api/files/*` verifies the key belongs to the caller.

---

## Project structure

```
client/                        React + Vite SPA
  src/lib/api.ts               typed API client (single source of truth for the contract)
  src/lib/types.ts             shared types mirrored from the server
  src/state/                   AuthContext, ToastContext, useInterviewSession (client state machine)
  src/components/ui            Button, Input, Card, Modal, Toast, ProgressBar, EmptyState, ErrorState…
  src/components/interview     MediaStage (TTS/STT/camera), SessionPanels (question, progress, feedback)
  src/components/report        ReportSection, ScoreGrid, QuestionReviewList, ImprovementPlan, methodology
  src/pages/                   Landing, auth, onboarding, dashboard, resume, job, setup, session, report,
                               history, progress, coach, profile, settings, 404
server/
  src/env.ts                   env resolution + feature flags
  src/db/                      schema, store contract, SQLite (sql.js) and Supabase drivers
  src/ai/                      engine contract, Gemini client + prompts, local engineered engine
  src/services/                resume, job, interview, scoring, report, pdf, analytics, coach, storage, extract
  src/routes/                  auth, profile, resume, job, interview, report, coach, files, meta
  src/tests/run.ts             end-to-end API test suite
supabase/migrations/0001_init.sql   11 tables + row-level security policies + storage buckets
```

---

## Scoring methodology (shown in every report)

Practice metrics only — never a hiring decision.

| Dimension | Weight | Basis |
| --- | --- | --- |
| Technical accuracy | 30% | Concept/keyword grounding, depth, use of trade-off reasoning |
| Communication | 20% | 0.7 × clarity (sentence length, filler words, readability) + 0.3 × structure (ordering words, STAR-shaped answers) |
| Problem solving | 20% | Situation → action → reasoning → outcome completeness |
| Relevance | 20% | Expected-topic coverage plus résumé/job grounding |
| Role alignment | 10% | 0.65 × share of the job's required skills your answers address + 0.35 × share of answers with strong technical depth |

Each answer first produces its own evaluation row (persisted), and every later number — live scores, report scores,
trends, weak topics, coach context — is computed from those stored rows. Nothing is invented on the client, and no
score is interpolated or seeded. The full formula text is returned by the API and rendered in the report's
"How scoring works" panel and in the PDF.

---

## Interview lifecycle (server-authoritative)

```
POST /api/interview/create      → generates question 1, persists settings, marks in_progress
POST /api/interview/:id/answer  → evaluates + stores the answer, may trigger a follow-up, completes at planned count
POST /api/interview/:id/skip    → stores a zero-score evaluation flagged as a gap
POST /api/interview/:id/question→ regenerates the next question without answering (recovery path)
POST /api/interview/:id/end     → finishes early and generates the report
GET  /api/interview/:id         → full resumable state: questions, answers, evaluations, live scores, report flag
```

Double submission is prevented twice: an in-process lock plus an idempotency check on `question_id`, so a
double-click, a retry or a refresh can never create duplicate answers or extra API calls.

## API surface

`/api/auth/*` (signup, login, logout, me, forgot-password, reset-password, change-password, account) ·
`/api/profile` (+ `POST /avatar`) · `/api/resume` (+ `/analyze`, `/text`, `/:id`) · `/api/job` (+ `/analyze`,
`/analyze-file`, `/:id`) · `/api/interview/*` · `/api/interviews/:id/report` (+ `/pdf`, `/regenerate`) ·
`/api/reports/:id` · `/api/dashboard` · `/api/progress` · `/api/weak-topics` · `/api/coach` (+ `/suggestions`) ·
`/api/files/*` · `/api/meta`, `/api/health`.

Errors always come back as `{ "error": { "message", "code", "details" } }` with a human-readable message — raw
provider or database errors are logged server-side and never surfaced to the user.

---

## Supabase setup (optional)

1. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (creates `profiles`, `resumes`,
   `job_descriptions`, `interviews`, `interview_questions`, `interview_answers`, `answer_evaluations`,
   `interview_reports`, `interview_progress`, plus auth/password-reset tables, RLS policies per table and the
   `documents` / `media` storage buckets with per-user folder policies).
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Restart the API. `GET /api/meta` should report `data_mode: "supabase"` and `auth.providers` including `supabase`.

Row ownership is enforced twice in that mode: RLS policies in Postgres and `user_id` filters in every service.

---

## Accessibility & responsiveness

- Keyboard-first: visible focus rings, Escape closes modals, focus is trapped inside dialogs, tab order follows
  the visual order.
- ARIA: labelled form fields, `role="radiogroup"` segmented controls, `aria-valuenow` progress bars, live regions
  for toasts, `aria-expanded` disclosures.
- Responsive from 360 px upward: mobile drawer + bottom navigation, stacked cards, horizontally scrollable tables,
  no horizontal page overflow, no clipped text (`truncate`/`min-w-0` used deliberately).
- Empty, loading and error states exist on every data surface, and animations are short and non-blocking.

## Testing

```bash
npm test
```

The suite boots the real Express app on a random port against a temporary SQLite database and checks 42 behaviours:
auth validation and session flows, password reset, account deletion, cross-account isolation, résumé + job analysis
(text and multipart), the full interview lifecycle including idempotency and skip handling, report completeness and
PDF integrity, list filters, analytics, coach, owner-only file serving, and scoring calibration (a strong résumé
answer must clearly outscore a vague one, and no score may leave the 0–100 range).

---

© VozLook Studios · VozLook InterviewAI provides practice feedback only.
