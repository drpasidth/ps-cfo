// Tests superuser deletion of tenants. Uses a temporary DATA_DIR so real data is untouched.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-del-'));
process.env.DATA_DIR = dir;
const { app, master } = require('../server.cjs');

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
  const req = (method, p, body, token) => fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'create-superuser.cjs'), 'root@test.com', 'rootpass123', 'Root'], { env: process.env });
    const root = await (await req('POST', '/api/auth/login', { email: 'root@test.com', password: 'rootpass123' })).json();

    let r = await req('POST', '/api/auth/signup', company({ companyName: 'Victim', email: 'v@test.com', contactPerson: 'V' }));
    const victimSignup = await r.json();
    const victimTenant = master.prepare('SELECT t.id, t.db_file FROM tenants t JOIN users u ON u.tenant_id = t.id WHERE u.email = ?').get('v@test.com');
    master.prepare('UPDATE users SET approved = 1 WHERE email = ?').run('v@test.com');
    r = await req('POST', '/api/auth/login', { email: 'v@test.com', password: 'password123' });
    const victimToken = (await r.json()).token;
    r = await req('PUT', '/api/data', { company: { companyName: 'Victim' }, activities: [{ id: 'a1', scope: 'scope1' }] }, victimToken);
    assert(r.ok, 'victim saves data before deletion');
    const dbPath = path.join(dir, victimTenant.db_file);
    assert(fs.existsSync(dbPath), 'victim tenant database file exists');

    // Non-superuser cannot delete
    r = await req('POST', '/api/auth/signup', company({ companyName: 'Other', email: 'o@test.com', contactPerson: 'O' }));
    const other = await r.json();
    r = await req('DELETE', `/api/admin/tenants/${victimTenant.id}`, undefined, other.token);
    assert(r.status === 403, 'non-superuser cannot delete a tenant');
    assert(master.prepare('SELECT 1 FROM tenants WHERE id = ?').get(victimTenant.id), 'tenant still exists after forbidden attempt');

    // Superuser cannot delete own company
    const rootTenantId = root.tenant.id;
    r = await req('DELETE', `/api/admin/tenants/${rootTenantId}`, undefined, root.token);
    assert(r.status === 400, 'superuser cannot delete their own company');

    // Unknown tenant
    r = await req('DELETE', '/api/admin/tenants/does-not-exist', undefined, root.token);
    assert(r.status === 404, 'unknown tenant returns 404');

    // Superuser deletes the victim tenant
    r = await req('DELETE', `/api/admin/tenants/${victimTenant.id}`, undefined, root.token);
    assert(r.ok, 'superuser deletes a tenant');
    assert(!master.prepare('SELECT 1 FROM tenants WHERE id = ?').get(victimTenant.id), 'tenant row removed');
    assert(!master.prepare('SELECT 1 FROM users WHERE tenant_id = ?').get(victimTenant.id), 'tenant users removed');
    assert(!master.prepare('SELECT 1 FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)').get('v@test.com'), 'tenant sessions removed');
    assert(!fs.existsSync(dbPath), 'tenant database file removed');

    r = await req('GET', '/api/auth/me', undefined, victimToken);
    assert(r.status === 401, 'deleted user token no longer valid');
    r = await req('POST', '/api/auth/login', { email: 'v@test.com', password: 'password123' });
    assert(r.status === 401, 'deleted user cannot log in');

    r = await req('GET', '/api/admin/tenants', undefined, root.token);
    const list = await r.json();
    assert(!list.some(t => t.id === victimTenant.id), 'deleted tenant not in admin list');
    assert(list.some(t => t.id === rootTenantId), 'superuser tenant still present');

    console.log('\nAll tenant deletion tests passed.');
  } finally {
    server.close();
    process.exit(0);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
