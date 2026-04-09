# Osiris Reporting Application - Project Context

Last updated: 2026-04-08

## Executive Summary
The project is functionally complete at application level (backend, frontend, docker, database flow), and production builds are passing.
There are still known gaps and placeholders that should be tracked as pending work.

Current verification status:
- Root build command passes: `npm run build` (client + server)
- Core routes are wired in `server/src/index.ts`
- Frontend routes/pages are wired in `client/src/App.tsx`

## Current Repository Snapshot

Top-level folders:
- `server/` backend API (Express + TypeScript + SQLite)
- `client/` frontend app (React + TypeScript + Vite)
- `docker/` container bootstrap scripts
- `data/`, `backups/` runtime persistence folders
- `node_modules/` installed dependencies

Sample files currently present:
- `server/IC_Reports_AgentSummary (6).xlsx`
- `server/IC_Reports_AgentUnavailableTime (25).xlsx`
- `server/report details.csv`

## Tech Stack

Backend:
- Node.js, Express, TypeScript
- SQLite (`sqlite`, `sqlite3`)
- Excel parsing with `exceljs`
- Email integration with Microsoft Graph (`@microsoft/microsoft-graph-client`, `@azure/identity`)
- Auth with JWT (`jsonwebtoken`)
- Uploads with `multer`

Frontend:
- React 18 + TypeScript
- Vite
- React Router
- TanStack Query
- TanStack Table
- Chart.js + react-chartjs-2
- Axios

Infra:
- Docker + Docker Compose (`docker-compose.yml`, `docker-compose.dev.yml`)

## Backend Status (Implemented)

Implemented modules:
- Authentication endpoints (`/api/auth/login`, `/logout`, `/validate`, `/change-password`)
- Upload flow (`/api/upload` + duplicate check + overwrite)
- Reports (`/api/reports` including summary, time-series, export, comments)
- Agents CRUD (`/api/agents`)
- Email send/bulk/history/retry/status (`/api/email`)
- Backup create/list/restore/stats/verify/delete/cleanup (`/api/backup`)
- Health endpoint (`/api/health`)

Database tables initialized by migrations:
- `monthly_reports`
- `agents`
- `agent_comments`
- `email_history`
- `email_delivery_reports`
- `backup_logs`
- `audit_logs`
- `file_uploads`

## Frontend Status (Implemented)

Main pages and navigation are present and wired:
- Login
- Dashboard
- Upload
- Reports
- Agents
- Email
- Backup

Auth context and protected routing are implemented.
Service clients for all major backend domains are implemented in `client/src/services`.

## Known Gaps / Pending Work

The following items are not fully implemented or are marked as placeholder behavior in code:

1. Upload history endpoint currently returns placeholder data
- `server/src/routes/upload.routes.ts` (`/history`)

2. Agent import endpoint is placeholder
- `server/src/routes/agent.routes.ts` (`/import`)

3. Email webhook handler is placeholder
- `server/src/routes/email.routes.ts` (`/webhook/delivery`)

4. Change password endpoint does not persist credentials
- `server/src/routes/auth.routes.ts` (`/change-password`)

5. Daily automated backup scheduler is not wired to an actual cron/scheduler trigger
- `server/src/services/backup/BackupService.ts` (`scheduleDailyBackup` exists but is not invoked by a scheduler)

## Environment and Security Notes

Important:
- Do not store real secrets in markdown or source files.
- Keep sensitive values only in local/private environment files.

Expected server env keys:
- `PORT`, `NODE_ENV`, `FRONTEND_URL`
- `JWT_SECRET`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `MAIL_TARGET_ADDRESS`
- `DATABASE_PATH`, `BACKUP_PATH`, `UPLOAD_PATH`
- `MAX_FILE_SIZE`, `EMAIL_RATE_LIMIT`

Use `server/.env.example` as template.

## Run Commands

Root commands:
```bash
npm run dev
npm run build
npm start
```

Backend only:
```bash
cd server
npm run dev
npm run build
npm run migrate
```

Frontend only:
```bash
cd client
npm run dev
npm run build
```

Docker:
```bash
docker-compose up -d
docker-compose -f docker-compose.dev.yml up
```

## Practical Project Status

Overall status: Completed with known defects.

Meaning:
- The end-to-end architecture and major functional flows exist.
- Build is passing.
- Some operational features are still partial and should be treated as backlog items (see "Known Gaps / Pending Work").

## Suggested Next Checklist (Before Final Sign-off)

1. Replace placeholder endpoints with full implementations.
2. Add automated scheduler for daily backups if required by operations.
3. Run manual integration checks for:
- upload + duplicate detection
- report query/export
- email preview/send/retry flow
- backup create/restore/verify/delete
4. Add automated tests (currently not enforced at root level).
5. Keep credentials out of tracked docs and rotate any previously exposed secrets.
