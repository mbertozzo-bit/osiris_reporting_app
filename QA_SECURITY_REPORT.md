# Osiris Reporting - QA and Security Report

Date: 2026-04-08  
Prepared for: Osiris Reporting Team

## 1. Executive Summary

The application is functionally complete and buildable, but recent incidents confirmed that formal QA and security controls are required before final sign-off.

Observed risk patterns in recent work:
- Data integrity regression risk (agent emails were unintentionally cleared during upload upsert logic).
- Frontend stability risk (render loop in Email page caused navigation lock and console flooding).
- Data lifecycle confusion risk (month-level deletion behavior not always matching user expectation).

This report proposes a practical QA and security program focused on preventing data loss, ensuring safe operations, and making releases predictable.

## 2. Objectives

1. Prevent destructive regressions affecting report and agent data.
2. Ensure email operations are reliable, auditable, and secure.
3. Enforce consistent validation across UI and API layers.
4. Establish repeatable release gates with measurable pass/fail criteria.

## 3. Scope

In scope:
- Authentication and session validation
- Upload pipeline (duplicate detection, overwrite, in-progress month guard)
- Reports and Data Management flows (edit/delete)
- Agents management (email integrity)
- Email send/preview/history flows
- Backup/restore flows
- API validation, logging, and security posture

Out of scope:
- Major architecture rewrites
- Non-critical UI polish unrelated to quality/security risk

## 4. Quality Targets (Release Criteria)

- P1 defects: 0 open
- P2 defects: 0 open in critical flows
- Smoke suite pass rate: 100%
- Regression suite pass rate: >= 98%
- Security scan critical findings: 0 unresolved
- Successful backup restore test: 1 per release cycle

## 5. QA Strategy

### 5.1 Test Layers

1. Unit Tests
- Parser and validator functions
- Month/year filtering logic
- Email payload generation
- Numeric normalization and report field mapping

2. Integration Tests (API + SQLite test DB)
- Upload end-to-end database writes
- Data Management edit/delete behavior
- Agent CRUD and email persistence
- Email endpoint request/response/error paths

3. End-to-End (Browser)
- Login -> Upload -> Reports -> Email -> Data Management -> Backup critical journeys
- Failure modes (invalid files, missing emails, invalid month, failed send)

### 5.2 Environments

1. Dev
- Fast local feedback for developers

2. Staging
- Mirror production configs and auth model
- Full regression and security verification

3. Production
- Restricted writes, monitored rollout, rollback ready

### 5.3 Data Sets

- Golden test files for valid uploads
- Corrupt/malformed files for negative tests
- Seeded agents with/without email
- Historical months and in-progress months for guard validation

## 6. Functional Test Matrix (High Priority)

### 6.1 Authentication
- Valid login, invalid login, token expiry handling
- Protected route access without token
- Logout invalidates session

### 6.2 Upload
- Both required files accepted only when valid
- Process button disabled unless both files are valid
- Duplicate check detects existing month data
- Overwrite deletes only target period
- In-progress month blocked by default
- Override works only when explicitly enabled
- Upload must not clear existing agent emails

### 6.3 Reports
- Dropdowns show only periods with real data
- No-data states handled gracefully
- Comment create/update/delete behavior
- Export output schema and row counts verified

### 6.4 Data Management
- Select month/year/agent and load editable fields
- Save updates monthly_reports and comments correctly
- Delete removes target agent-month data and related email records
- Month availability behavior consistent with policy

### 6.5 Agents
- Email edits persist across upload cycles
- Bulk update validations (invalid emails rejected)
- Delete agent blocked if reports exist

### 6.6 Email
- Graph config health reflected in UI
- Period dropdown only shows available data periods
- Agent selection reflects selected period only
- Single and bulk send success/failure handling
- CC validation and delivery payload correctness
- History displays correct status transitions

### 6.7 Backup
- Manual backup success
- Restore success from recent backup
- Post-restore data integrity checks

## 7. Security Plan

### 7.1 Secrets and Credentials

- Keep all credentials in environment variables or secret store only.
- Remove secrets from docs and chat artifacts where possible.
- Rotate exposed secrets immediately (Azure client secret recommended).
- Enforce separate secrets per environment.

### 7.2 Authentication and Authorization

- Verify auth middleware on all mutating routes.
- Validate user identity in audit logs for sensitive actions.
- Add brute-force/rate-limiting on login and send-email routes.

### 7.3 Input and File Validation

- Validate month/year ranges server-side (never trust UI only).
- Validate file size, extension, MIME, and parser-safe structure.
- Sanitize textual inputs used in logs/emails/comments.

### 7.4 Data Integrity Controls

- Use conflict-safe upsert patterns that do not overwrite unrelated fields.
- Wrap destructive operations in transactions.
- Add before/after row-count checks in destructive endpoints.
- Add explicit month-level delete endpoint with confirmation semantics.

### 7.5 Email Security Controls

- Restrict sender mailbox to approved identities.
- Rate limit bulk sends and log recipient counts.
- Validate `to` and `cc` addresses server-side.
- Ensure audit logs capture initiator, target month/year, and counts.

### 7.6 Dependency and Code Security

- Add CI checks for `npm audit` (server/client).
- Add secret scanning in CI.
- Add SAST checks for backend and frontend repositories.

## 8. Recommended Automation Stack

- Backend: Jest + Supertest + isolated SQLite fixtures
- Frontend: Vitest + React Testing Library
- E2E: Playwright
- Security: npm audit + secret scan + OWASP ZAP baseline (staging)
- CI Pipeline: lint -> type-check -> unit -> integration -> build -> e2e smoke -> security scans

## 9. Observability and Incident Readiness

- Track:
  - Upload failures by reason
  - Email send failures by error family
  - Auth failures and burst patterns
  - Destructive action counts (delete/overwrite)
- Alert thresholds:
  - Sudden spike in failed sends
  - Unexpected drop in agents with valid email
  - Repeated destructive operations
- Maintain runbooks for:
  - Restore from backup
  - Email outage fallback
  - Data correction workflow

## 10. Implementation Roadmap (4 Weeks)

Week 1:
- Define critical smoke suite and regression checklist
- Add backend integration tests for upload/data-management/email
- Add secret rotation and secret scanning policy

Week 2:
- Implement frontend unit tests for month filtering and no-data states
- Add Playwright smoke flows
- Add CI quality gates

Week 3:
- Add security baseline scans in staging
- Run abuse-case tests (malformed upload, invalid payloads, rate-limit tests)
- Fix findings

Week 4:
- UAT with business scenarios
- Backup/restore drill with evidence
- Release readiness review

## 11. Evidence to Collect Per Release

- Test results summary (unit/integration/e2e)
- Security scan reports and disposition
- Backup restore proof
- Risk log with open/closed items
- Final go/no-go checklist signed by owner

## 12. Immediate Actions (Already Recommended)

1. Rotate Azure client secret due prior exposure in conversational context.
2. Keep periodic DB backups before destructive operations.
3. Confirm all critical agents have valid email addresses before email campaigns.
4. Continue using data-driven period dropdowns to avoid invalid selections.

## 13. Final Recommendation

Adopt this QA + security plan as release policy, not only as a one-time cleanup.  
Given the app's operational role (monthly reporting and outbound communication), quality and security controls should be treated as mandatory release gates.


