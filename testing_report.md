# Osiris Reporting - Testing Report

Date: 2026-04-08  
Executed by: Codex (local execution)  
Primary API target: `http://localhost:3001`

## 1. Scope Executed

This execution campaign covered the tests defined in `QA_SECURITY_REPORT.md` using currently available tooling in the repository.

Executed groups:
- Build and static quality commands
- API integration tests for Auth/Upload/Reports/Data Management/Agents/Email/Backup
- Security-oriented runtime checks (headers, brute-force behavior)
- Dependency vulnerability scans (`npm audit`)

Evidence artifacts generated:
- `qa_test_results_raw.json`
- `server_audit.json`
- `client_audit.json`
- `server_typecheck.log`
- `client_lint.log`
- `root_test.log`
- `server_test.log`
- `client_test.log`

## 2. Automated Command Results

| Check | Command | Result | Notes |
|---|---|---|---|
| Root Build | `npm run build` | PASS | Client + server production builds completed successfully. |
| Server Type Check | `cd server && npm run type-check` | FAIL | TypeScript strict checks reported multiple errors (unused vars + possible undefined). |
| Client Lint | `cd client && npm run lint` | FAIL | ESLint config missing in client project (`ESLint couldn't find a configuration file`). |
| Root Unit Test Command | `npm test` | FAIL | Script missing. |
| Server Unit Test Command | `cd server && npm test` | FAIL | Script missing. |
| Client Unit Test Command | `cd client && npm test` | FAIL | Script missing. |

## 3. Integration/API Test Campaign

Source of truth: `qa_test_results_raw.json`

Summary:
- Total: **34**
- Passed: **31**
- Failed: **3**
- Runtime errors: **0**

### 3.1 Failed Tests

1. `AUTH_004` - Logout invalidates token  
- Expected: token invalid after logout  
- Actual: token remains valid (`logout=200`, `validateAfterLogout=200`)  
- Interpretation: stateless JWT logout behavior (no revocation/blacklist).

2. `UPLOAD_003` - In-progress month blocked without override  
- Expected assertion: specific in-progress-block error text  
- Actual: request failed early with upload-middleware file requirement message  
- Note: status was still `400`; failure is due to strict assertion on error text.

3. `UPLOAD_004` - Closed month requires both files  
- Expected assertion: error text containing \"both\"  
- Actual: middleware returned `Please upload one Agent Summary file and one Agent Unavailable Time file`  
- Note: status was `400`; failure is assertion-string strictness, not status behavior.

## 4. Functional Coverage Outcomes

### 4.1 Authentication
- Valid login: PASS
- Invalid login: PASS
- Protected route without token: PASS
- Logout invalidation: FAIL (token still valid)

### 4.2 Upload
- Duplicate check existing month: PASS
- Invalid month validation: PASS
- File requirement validation: PASS at status level (`400`)
- Upload history endpoint shape: PASS

### 4.3 Reports + Data Management
- Available periods endpoint: PASS
- Primary period report retrieval: PASS
- No data for April 2026: PASS
- Summary endpoint: PASS
- Agent list month/year filtering: PASS
- Comment update roundtrip via manage endpoint: PASS
- Delete non-existent managed record: PASS

### 4.4 Agents
- List agents: PASS
- Invalid email rejection: PASS
- Delete blocked when reports exist: PASS
- Bulk update invalid email error reporting: PASS

### 4.5 Email
- Graph config readiness endpoint: PASS
- Preview generation with HTML body: PASS
- Invalid CC rejected: PASS
- History retrieval: PASS
- Unknown agent/month rejected: PASS
- Bulk preview: PASS

### 4.6 Backup
- Create backup: PASS
- List includes created backup: PASS
- Verify backup: PASS
- Stats endpoint: PASS
- Restore with confirmation: PASS
- Cleanup endpoint: PASS
- Delete without confirmation rejected: PASS

## 5. Security Results

### 5.1 Dependency Vulnerabilities (`npm audit`)

Server (`server_audit.json`):
- Total: **7**
- High: **5**
- Low: **2**
- Critical: **0**

Client (`client_audit.json`):
- Total: **8**
- High: **6**
- Moderate: **2**
- Critical: **0**

### 5.2 Brute-force / Rate-limit Behavior Check

Test executed: 12 rapid invalid login attempts against `/api/auth/login`  
Result: all returned `401`, no `429` observed.

Conclusion: explicit login rate limiting is not currently enforced.

### 5.3 Baseline Header Check

Health endpoint includes baseline hardening headers (e.g., `x-content-type-options: nosniff`): PASS.

## 6. Gaps Against QA_SECURITY_REPORT Expectations

The following planned test layers are **not yet executable** due missing test infrastructure/scripts in repository:
- Unit test suites (backend/frontend)
- Integration test framework (automated runner + fixtures)
- E2E browser suite (Playwright/Cypress not configured)
- SAST/DAST pipeline integration in CI

## 7. Overall Status

Current status: **Partially passing, not release-gated yet**.

Blocking issues before a strict QA/security sign-off:
1. Add and enforce automated test scripts (`test`) for server/client/root.
2. Add ESLint configuration for client lint gate.
3. Resolve server `type-check` errors.
4. Implement logout token revocation policy if logout invalidation is a requirement.
5. Add login rate limiting / brute-force protection.
6. Triage and remediate high vulnerabilities from `npm audit`.

## 8. Recommended Immediate Next Steps

1. Establish minimum CI gate: `build + type-check + lint + integration smoke`.
2. Add backend integration test harness (auth/upload/reports/email/backup critical paths).
3. Add frontend component/page tests for period filtering and no-data states.
4. Introduce Playwright smoke suite for login -> upload -> reports -> email path.
5. Create vulnerability remediation plan with dependency upgrade windows.

