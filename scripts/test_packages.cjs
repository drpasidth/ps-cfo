// Checks membership packages: seeded packages, signup default, admin-only editing,
// validation, and that package changes show up in the tenant's session.
// Uses a temporary data directory, so your real databases are not touched.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-packages-test-'));
const { app, master, hashPassword } = require('../server.cjs');

const failures = [];
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

(async () => {
  // Superuser account
  const now = new Date().toISOString();
  master.prepare('INSERT INTO tenants (id, name, db_file, created_at, package_id) VALUES (?,?,?,?,?)')
    .run('platform', 'Platform', 'tenants/platform.sqlite3', now, 'BB');
  master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_superuser, approved, created_at)
    VALUES (?,?,?,?,?,?,1,1,?)`).run(crypto.randomUUID(), 'platform', 'root@test.local', 'Root', hashPassword('password123'), 'owner', now);
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

  try {
    const seeded = master.prepare('SELECT code, features FROM packages ORDER BY code').all();
    check('four packages seeded (A, AA, B, BB)', seeded.map(p => p.code).join(',') === 'A,AA,B,BB');
    const feats = Object.fromEntries(seeded.map(p => [p.code, JSON.parse(p.features).sort().join(',')]));
    check('A = scope1,scope2,verification', feats.A === 'scope1,scope2,verification');
    check('AA = A + report_word', feats.AA === 'report_word,scope1,scope2,verification');
    check('B = scope1,scope2,scope3,verification', feats.B === 'scope1,scope2,scope3,verification');
    check('BB = B + report_word', feats.BB === 'report_word,scope1,scope2,scope3,verification');

    // Signup defaults to package A (pending approval)
    const signup = await call('POST', '/api/auth/signup', null, {
      email: 'co@test.local', password: 'password123', contactPerson: 'Owner', companyName: 'Co Ltd',
      taxId: '1234567890123', address: '1 Test Road', contactPhone: '0812345678',
    });
    check('signup accepted', signup.status === 201);
    const tenantRow = master.prepare('SELECT t.id, t.package_id FROM tenants t JOIN users u ON u.tenant_id = t.id WHERE u.email = ?').get('co@test.local');
    check('new tenant gets package A', tenantRow.package_id === 'A');
    master.prepare('UPDATE users SET approved = 1 WHERE email = ?').run('co@test.local');

    const login = await call('POST', '/api/auth/login', null, { email: 'co@test.local', password: 'password123' });
    const tokenCo = login.json.token;
    check('login returns package A', login.json.tenant?.package?.code === 'A');

    // Non-superuser cannot edit packages
    check('tenant cannot list admin packages', (await call('GET', '/api/admin/packages', tokenCo)).status === 403);
    check('tenant cannot edit package', (await call('PUT', '/api/admin/packages/B', tokenCo, { price: 1 })).status === 403);

    const rootLogin = await call('POST', '/api/auth/login', null, { email: 'root@test.local', password: 'password123' });
    const root = rootLogin.json.token;
    const list = await call('GET', '/api/admin/packages', root);
    check('superuser lists packages', list.status === 200 && list.json.length === 4);

    // Superuser sets price and features
    const edit = await call('PUT', '/api/admin/packages/B', root, { price: 2999, features: ['scope1', 'scope2', 'scope3', 'verification', 'report_word'] });
    check('superuser edits price and features', edit.status === 200);
    const bAfter = (await call('GET', '/api/admin/packages', root)).json.find(p => p.code === 'B');
    check('price saved', bAfter.price === 2999);
    check('features saved', bAfter.features.includes('report_word'));

    // Validation
    check('negative price rejected', (await call('PUT', '/api/admin/packages/B', root, { price: -5 })).status === 400);
    check('unknown feature rejected', (await call('PUT', '/api/admin/packages/B', root, { features: ['payroll'] })).status === 400);
    check('unknown package rejected', (await call('PUT', '/api/admin/packages/ZZ', root, { price: 1 })).status === 404);

    // Assign package B to the company; session reflects it without re-login
    const tenantId = tenantRow.id;
    check('assign package B', (await call('PUT', `/api/admin/tenants/${tenantId}/package`, root, { packageId: 'B' })).status === 200);
    check('assign unknown package rejected', (await call('PUT', `/api/admin/tenants/${tenantId}/package`, root, { packageId: 'nope' })).status === 400);
    const me = await call('GET', '/api/auth/me', tokenCo);
    check('session now shows package B', me.json.tenant.package.code === 'B');
    check('session shows edited B price features', me.json.tenant.package.features.includes('report_word'));

    const adminList = (await call('GET', '/api/admin/tenants', root)).json;
    check('admin tenant list shows packageId', adminList.find(t => t.id === tenantId)?.packageId === 'B');
  } finally {
    server.close();
  }

  master.close();
  console.log(failures.length ? `\n${failures.length} failed` : '\nAll checks passed');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
