const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3001';
const username = process.env.LOGIN_USERNAME || 'Osiris';
const password = process.env.LOGIN_PASSWORD || 'Osiris';

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function main() {
  console.log(`[smoke] Base URL: ${baseUrl}`);

  const health = await requestJson('/api/health');
  assert(health.response.status === 200, `Health check expected 200, got ${health.response.status}`);

  const login = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  assert(login.response.status === 200, `Login expected 200, got ${login.response.status}`);
  const token = login.body?.token;
  assert(Boolean(token), 'Login did not return a token');

  if (!token) {
    throw new Error('Smoke stopped: missing auth token');
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  const validateBefore = await requestJson('/api/auth/validate', {
    headers: authHeaders
  });
  assert(validateBefore.response.status === 200, `Validate (before logout) expected 200, got ${validateBefore.response.status}`);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const inProgressForm = new FormData();
  inProgressForm.set('month', String(currentMonth));
  inProgressForm.set('year', String(currentYear));

  const uploadInProgress = await requestJson('/api/upload', {
    method: 'POST',
    headers: authHeaders,
    body: inProgressForm
  });

  assert(uploadInProgress.response.status === 400, `Upload in-progress guard expected 400, got ${uploadInProgress.response.status}`);
  assert(
    uploadInProgress.body?.error === 'In-progress month upload blocked',
    `Upload in-progress guard expected explicit block error, got ${uploadInProgress.body?.error || 'unknown'}`
  );

  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const closedForm = new FormData();
  closedForm.set('month', String(prevMonth));
  closedForm.set('year', String(prevYear));

  const uploadClosed = await requestJson('/api/upload', {
    method: 'POST',
    headers: authHeaders,
    body: closedForm
  });

  assert(uploadClosed.response.status === 400, `Upload closed month without files expected 400, got ${uploadClosed.response.status}`);
  assert(
    uploadClosed.body?.error === 'Both Agent Summary and Agent Unavailable Time files are required',
    `Upload closed month file validation message mismatch: ${uploadClosed.body?.error || 'unknown'}`
  );

  const availableMonths = await requestJson('/api/reports/available-months', {
    headers: authHeaders
  });
  assert(availableMonths.response.status === 200, `Available months expected 200, got ${availableMonths.response.status}`);
  assert(Array.isArray(availableMonths.body?.months), 'Available months response missing months[]');

  const emailConfig = await requestJson('/api/email/config', {
    headers: authHeaders
  });
  assert(emailConfig.response.status === 200, `Email config expected 200, got ${emailConfig.response.status}`);

  const logout = await requestJson('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders
  });
  assert(logout.response.status === 200, `Logout expected 200, got ${logout.response.status}`);

  const validateAfter = await requestJson('/api/auth/validate', {
    headers: authHeaders
  });
  assert(validateAfter.response.status === 401, `Validate (after logout) expected 401, got ${validateAfter.response.status}`);

  if (failures.length > 0) {
    console.error('[smoke] Failed checks:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('[smoke] All checks passed.');
}

main().catch(error => {
  console.error('[smoke] Execution error:', error);
  process.exit(1);
});
