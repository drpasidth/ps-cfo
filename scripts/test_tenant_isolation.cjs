// Checks that tenants are isolated: each company only sees its own data and settings.
// Runs the real API against a temporary data directory, so your real databases are not touched.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-tenant-test-'));
process.env.DATA_DIR = dataDir;
const { app, master, getTenantDb, hashPassword } = require('../server.cjs');
const crypto = require('crypto');

function addTenant(name, email) {
  const tenantId = crypto.randomUUID();
  const file = `tenants/${tenantId}.sqlite3`;
  // Paid until next year so the subscription check does not block these test tenants.
  master.prepare('INSERT INTO tenants (id, name, db_file, created_at, paid_until) VALUES (?,?,?,?,?)')
    .run(tenantId, name, file, new Date().toISOString(), '2999-12-31T00:00:00.000Z');
  master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, approved, created_at)
    VALUES (?,?,?,?,?,?,1,?)`).run(crypto.randomUUID(), tenantId, email, name, hashPassword('password123'), 'owner', new Date().toISOString());
  getTenantDb(file);
  return { tenantId, file };
}

const failures = [];
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, token, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
  const login = async (email) => (await call('POST', '/api/auth/login', null, { email, password: 'password123' })).json.token;

  try {
    addTenant('Company A', 'a@test.local');
    addTenant('Company B', 'b@test.local');
    const tokenA = await login('a@test.local');
    const tokenB = await login('b@test.local');

    // Company A saves a setting and company data
    check('A can write kv', (await call('PUT', '/api/kv/scope1.efRows', tokenA, { value: '[1]' })).status === 200);
    check('A can save company data', (await call('PUT', '/api/data', tokenA, {
      company: { companyName: 'Company A' },
      activities: [{ id: 'a1', scope: 'scope1', activityData: 5 }],
    })).status === 200);

    // Company B must not see A's settings or data
    const kvB = await call('GET', '/api/kv', tokenB);
    check('B does not see A kv', kvB.json['scope1.efRows'] === undefined);
    const dataB = await call('GET', '/api/data', tokenB);
    check('B does not see A activities', (dataB.json.activities || []).length === 0);
    check('B company name is not A', dataB.json.company?.companyName !== 'Company A');

    // Company B writes the same key; A keeps its own value
    await call('PUT', '/api/kv/scope1.efRows', tokenB, { value: '[2]' });
    const kvA = await call('GET', '/api/kv', tokenA);
    check('A keeps its own value after B writes', kvA.json['scope1.efRows'] === '[1]');
    check('B has its own value', (await call('GET', '/api/kv', tokenB)).json['scope1.efRows'] === '[2]');

    // Delete is scoped too
    await call('DELETE', '/api/kv/scope1.efRows', tokenB);
    check('B delete does not remove A value', (await call('GET', '/api/kv', tokenA)).json['scope1.efRows'] === '[1]');

    // Invalid keys and no token are rejected
    check('invalid key rejected', (await call('PUT', '/api/kv/bad%20key', tokenA, { value: 'x' })).status === 400);
    check('kv without login rejected', (await call('GET', '/api/kv', null)).status === 401);
  } finally {
    server.close();
  }

  // The tenant databases are separate files
  const files = fs.readdirSync(path.join(dataDir, 'tenants')).filter((f) => f.endsWith('.sqlite3'));
  check('one database file per tenant', files.length === 2);

  master.close();
  console.log(failures.length ? `\n${failures.length} failed` : '\nAll checks passed');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
