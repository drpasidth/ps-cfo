// Smoke test for multi-tenant auth. Uses a temporary DATA_DIR so real data is untouched.
const os = require('os');
const path = require('path');
const fs = require('fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-test-'));
process.env.DATA_DIR = dir;
const { app, master } = require('../server.cjs');
// Mirrors the superuser approval: approve the account and start the 1-month free trial.
const approve = (email) => {
  master.prepare('UPDATE users SET approved = 1 WHERE email = ?').run(email);
  master.prepare(`UPDATE tenants SET trial_ends_at = datetime('now', '+1 month') WHERE id = (SELECT tenant_id FROM users WHERE email = ?) AND trial_ends_at IS NULL AND paid_until IS NULL`).run(email);
};

const assert = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('ok -', msg);
};

const company = (over) => ({
  companyName: 'Company',
  taxId: '1234567890123',
  address: '1 Test Road, Bangkok',
  contactPhone: '081-234-5678',
  contactPerson: 'Owner',
  email: 'x@test.com',
  password: 'password123',
  ...over,
});

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (p, body, token) => fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const get = (p, token) => fetch(base + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const put = (p, body, token) => fetch(base + p, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });

  try {
    // Tenant A: signup logs in right away, but the account is not approved yet
    let r = await post('/api/auth/signup', company({ companyName: 'Company A', email: 'a@test.com', contactPerson: 'A' }));
    assert(r.status === 201, 'signup tenant A succeeds');
    const signupA = await r.json();
    assert(signupA.token && signupA.user.approved === false, 'signup returns a session for an unapproved account');
    r = await get('/api/billing/packages', signupA.token);
    assert(r.ok, 'unapproved account can list packages');
    r = await get('/api/data', signupA.token);
    assert(r.status === 403, 'unapproved account cannot read data');

    r = await post('/api/auth/signup', company({ companyName: 'Company A', email: 'a@test.com' }));
    assert(r.status === 409, 'duplicate email rejected');

    r = await post('/api/auth/signup', company({ email: 'bad@test.com', taxId: '123' }));
    assert(r.status === 400, 'tax ID must be 13 digits');

    r = await post('/api/auth/signup', company({ email: 'short@test.com', password: 'short' }));
    assert(r.status === 400, 'short password rejected');

    approve('a@test.com');
    r = await post('/api/auth/login', { email: 'a@test.com', password: 'password123' });
    const tokenA = (await r.json()).token;
    assert(tokenA, 'approved account logs in');

    // Tenant B
    r = await post('/api/auth/signup', company({ companyName: 'Company B', email: 'b@test.com', contactPerson: 'B' }));
    assert(r.status === 201, 'signup tenant B succeeds');
    approve('b@test.com');
    r = await post('/api/auth/login', { email: 'b@test.com', password: 'password123' });
    const tokenB = (await r.json()).token;

    // Data isolation
    r = await put('/api/data', { company: { companyName: 'A-only' }, activities: [{ id: 'x1', scope: 'scope1' }] }, tokenA);
    assert(r.ok, 'tenant A saves data');
    r = await get('/api/data', tokenB);
    const dataB = await r.json();
    assert(dataB.activities.length === 0, 'tenant B does not see tenant A activities');
    assert(dataB.company && dataB.company.companyName === 'Company B', 'tenant B company is its own');
    r = await get('/api/data', tokenA);
    const dataA = await r.json();
    assert(dataA.company.companyName === 'A-only' && dataA.activities.length === 1, 'tenant A reads its own data');

    // Auth required
    r = await get('/api/data');
    assert(r.status === 401, 'data requires login');
    r = await get('/api/data', 'bogus');
    assert(r.status === 401, 'invalid token rejected');

    // Login
    r = await post('/api/auth/login', { email: 'a@test.com', password: 'wrong-pass' });
    assert(r.status === 401, 'wrong password rejected');
    r = await post('/api/auth/login', { email: 'A@test.com', password: 'password123' });
    assert(r.ok, 'login with correct password (email case-insensitive)');
    const loginBody = await r.json();
    assert(loginBody.tenant.name === 'Company A', 'login returns tenant');

    // Logout invalidates token
    r = await post('/api/auth/logout', {}, tokenA);
    r = await get('/api/auth/me', tokenA);
    assert(r.status === 401, 'token invalid after logout');

    // Superuser: create via CLI, then access admin overview
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, [path.join(__dirname, 'create-superuser.cjs'), 'root@test.com', 'rootpass123', 'Root'], { env: process.env });
    const rootLogin = await (await post('/api/auth/login', { email: 'root@test.com', password: 'rootpass123' })).json();
    assert(rootLogin.user.isSuperuser === true, 'superuser login flagged isSuperuser');
    r = await get('/api/admin/tenants', rootLogin.token);
    assert(r.ok, 'superuser can list tenants');
    const tenants = await r.json();
    assert(tenants.length >= 3 && tenants.some(t => t.companyName === 'Company B'), 'admin list includes all tenants');

    const normal = await (await post('/api/auth/login', { email: 'b@test.com', password: 'password123' })).json();
    // Pending account: logs in but has no data access until approved
    r = await post('/api/auth/signup', company({ companyName: 'Company C', email: 'c@test.com', contactPerson: 'C' }));
    const pendingUser = master.prepare('SELECT id FROM users WHERE email = ?').get('c@test.com');
    r = await get('/api/data', (await r.json()).token);
    assert(r.status === 403, 'pending account blocked from data');
    r = await post(`/api/admin/users/${pendingUser.id}/approve`, {}, rootLogin.token);
    assert(r.ok, 'superuser approves pending account');
    r = await post('/api/auth/login', { email: 'c@test.com', password: 'password123' });
    assert(r.ok, 'approved account from admin can log in');
    r = await get('/api/data', (await r.json()).token);
    assert(r.ok, 'approved account can read its data');
    r = await get('/api/admin/tenants', normal.token);
    assert(r.status === 403, 'normal user forbidden from admin API');

    console.log('\nAll auth tests passed.');
  } finally {
    server.close();
  }
})().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
