# Incremental Refactor Plan

Date: 2026-04-09  
Scope: Backend TypeScript stabilization and maintainability improvements

## 1. Baseline and Freeze (Day 0)

- Capture current baseline:
  - `npm run build`
  - `cd server && npm run type-check`
- Save TypeScript error list by file and error code.
- Freeze feature work in backend files touched by this refactor window.

## 2. Add Safety Harness (Day 1)

- Add a small repeatable backend smoke script for critical endpoints:
  - Login
  - Token validate
  - Upload guard behavior
  - Reports availability
  - Email config endpoint
- Objective: every refactor change proves no behavioral regression.

## 3. Pass 1: Fix Runtime-Risk Type Errors First (Day 1-2)

- Target only high-risk TypeScript errors:
  - `TS18048` (possibly undefined)
  - `TS7030` (not all code paths return a value)
- Priority files:
  - `server/src/controllers/agent.controller.ts`
  - `server/src/controllers/email.controller.ts`
  - `server/src/controllers/report.controller.ts`
  - `server/src/controllers/upload.controller.ts`
  - `server/src/routes/auth.routes.ts`
  - `server/src/services/excel/ExcelParserService.ts`
- Refactor patterns:
  - Explicit null/undefined guards
  - Early return on invalid state
  - Safe defaults
  - Complete return paths in route handlers
- Acceptance criteria:
  - All `TS18048` and `TS7030` errors resolved
  - No endpoint behavior changes

## 4. Pass 2: Remove Noise Errors (Day 2-3)

- Clean non-critical TypeScript noise:
  - `TS6133` (declared but never read)
- Scope:
  - Controllers
  - Routes
  - `server/src/index.ts`
  - Middleware
  - Database/service utility files
- Acceptance criteria:
  - No `TS6133` remaining
  - Cleaner review signal for future regressions

## 5. Pass 3: Type Contract Hardening (Day 3-4)

- Standardize typed request/response shapes in common handlers.
- Add focused interfaces for DB query row shapes where `db.get` can be undefined.
- Reduce ad-hoc casts and improve compile-time guarantees.
- Acceptance criteria:
  - Fewer defensive casts
  - Clearer type contracts around controller/database boundaries

## 6. Pass 4: Middleware/Controller Boundary Cleanup (Day 4-5)

- Clarify ownership:
  - Middleware validates transport/input concerns
  - Controllers implement business rules
- Remove duplicated validation checks where safe.
- Keep behavior unchanged.
- Acceptance criteria:
  - Cleaner request flow
  - No regressions in auth/upload/report/email critical paths

## 7. Pass 5: Quality Gate Enforcement (Day 5)

- Require these checks before release:
  - `cd server && npm run type-check`
  - `npm run build`
  - Backend smoke script
- Add these as mandatory merge/release criteria.
- Acceptance criteria:
  - Main branch maintains green type-check/build gates

## 8. Pass 6: Optional Structural Refactor (Post-cleanup)

- Only after type-check is clean:
  - Extract reusable validators/helpers
  - Reduce controller size and complexity
- Keep this in separate PRs to isolate risk.

## PR Strategy

1. PR-1: Baseline snapshot + safety harness.
2. PR-2: Runtime-risk type fixes (group A files).
3. PR-3: Runtime-risk type fixes (group B files).
4. PR-4: `TS6133` cleanup.
5. PR-5: Type contract hardening.
6. PR-6: Boundary cleanup + gate enforcement.

## Definition of Done

1. `cd server && npm run type-check` passes with zero errors.
2. `npm run build` passes.
3. Smoke checks pass for critical endpoints.
4. No functional regressions in auth/upload/report/email flows.
5. Refactor tracking log updated with final zero-error baseline.
