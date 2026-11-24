// End-to-end check of tenant admin / team members / package user limits / permissions.
// Runs against a temporary data folder, so real data is never touched.
//   node scripts/test_team.cjs
const os = require('os');
const path = require('path');
const fs = require('fs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-team-test-'));
process.env.DATA_DIR = dataDir;

const { app, master } = require('../server.cjs');

let failures = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`);
  if (!cond) failures++;
}

async function call(base, method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1. Signup: the applicant becomes tenant admin.
  const signup = await call(base, 'POST', '/api/auth/signup', null, {
    email: 'admin@test-co.com', password: 'password123', companyName: 'Test Co',
    taxId: '1234567890123', address: 'Bangkok', contactPhone: '0812345678', contactPerson: 'Admin One',
  });
  check('signup succeeds', signup.status === 201, `(${signup.status})`);
  const adminToken = signup.json.token;
  const me = await call(base, 'GET', '/api/auth/me', adminToken);
  check('signup user is tenant admin', me.json.user.isTenantAdmin === true && me.json.user.role === 'tenant_admin');

  // Approve the account and give the company Package A (1 user).
  const tenantId = me.json.tenant.id;
  master.prepare('UPDATE users SET approved = 1 WHERE tenant_id = ?').run(tenantId);
  master.prepare("UPDATE tenants SET package_id = 'A', trial_ends_at = datetime('now', '+1 month') WHERE id = ?").run(tenantId);

  const team0 = await call(base, 'GET', '/api/team', adminToken);
  check('package A allows 1 user', team0.json.maxUsers === 1, `(maxUsers=${team0.json.maxUsers})`);
  const blocked = await call(base, 'POST', '/api/team', adminToken, {
    email: 'staff@test-co.com', name: 'Staff', password: 'password123',
  });
  check('package A blocks adding a 2nd user', blocked.status === 403, `(${blocked.status})`);

  // 2. Package AA allows 5 users: add a member with read-only permissions.
  master.prepare("UPDATE tenants SET package_id = 'AA' WHERE id = ?").run(tenantId);
  const added = await call(base, 'POST', '/api/team', adminToken, {
    email: 'staff@test-co.com', name: 'Staff', password: 'password123',
  });
  check('admin adds a member on package AA', added.status === 201, `(${added.status} ${added.json?.error || ''})`);
  const memberId = added.json.id;

  const memberLogin = await call(base, 'POST', '/api/auth/login', null, {
    email: 'staff@test-co.com', password: 'password123',
  });
  const memberToken = memberLogin.json.token;
  const memberMe = await call(base, 'GET', '/api/auth/me', memberToken);
  check('member is not tenant admin', memberMe.json.user.isTenantAdmin === false);
  check('member can read activities by default', memberMe.json.user.permissions.activities.read === true);
  check('member cannot create activities by default', memberMe.json.user.permissions.activities.create === false);

  // 3. Member permissions are enforced on data and settings.
  const act = { id: 'act-1', scope: 'scope1', amount: 10 };
  const memberSave = await call(base, 'PUT', '/api/data', memberToken, { company: null, activities: [act] });
  check('member blocked from creating activities', memberSave.status === 403, `(${memberSave.status})`);
  const memberRead = await call(base, 'GET', '/api/data', memberToken);
  check('member can read data', memberRead.status === 200);
  const memberKv = await call(base, 'PUT', '/api/kv/ef.test', memberToken, { value: '1' });
  check('member blocked from settings write', memberKv.status === 403, `(${memberKv.status})`);

  // Admin grants: activities create + update, settings update.
  const grant = await call(base, 'PUT', `/api/team/${memberId}`, adminToken, {
    permissions: { activities: { create: true, read: true, update: true, delete: false }, settings: { update: true, read: true } },
  });
  check('admin updates member permissions', grant.status === 200, `(${grant.status})`);

  const memberSave2 = await call(base, 'PUT', '/api/data', memberToken, { company: null, activities: [act] });
  check('member can create after grant', memberSave2.status === 200, `(${memberSave2.status})`);
  const memberDelete = await call(base, 'PUT', '/api/data', memberToken, { company: null, activities: [] });
  check('member blocked from deleting (not granted)', memberDelete.status === 403, `(${memberDelete.status})`);
  const memberKv2 = await call(base, 'PUT', '/api/kv/ef.test', memberToken, { value: '1' });
  check('member can write settings after grant', memberKv2.status === 200, `(${memberKv2.status})`);

  // 4. Members cannot manage the team.
  const memberTeam = await call(base, 'GET', '/api/team', memberToken);
  check('member cannot open team page', memberTeam.status === 403, `(${memberTeam.status})`);

  // 5. Admin can remove the member; the member is then logged out.
  const del = await call(base, 'DELETE', `/api/team/${memberId}`, adminToken);
  check('admin removes member', del.status === 200);
  const afterDel = await call(base, 'GET', '/api/auth/me', memberToken);
  check('removed member session is gone', afterDel.status === 401, `(${afterDel.status})`);

  server.close();
  master.close();
  // Windows keeps tenant database files open until the process exits, so cleanup is best effort.
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    console.log(`(temp data left at ${dataDir})`);
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
