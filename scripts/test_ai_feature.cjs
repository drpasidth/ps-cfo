// Tests that the AI assistant is gated by the package 'ai' feature. Uses a temporary DATA_DIR.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-ai-'));
process.env.DATA_DIR = dir;
const { app, master } = require('../server.cjs');

const assert = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('ok -', msg);
};

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = (method, p, body, token) => fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'create-superuser.cjs'), 'root@test.com', 'rootpass123', 'Root'], { env: process.env });
    const root = await (await call('POST', '/api/auth/login', { email: 'root@test.com', password: 'rootpass123' })).json();

    // Customer company
    await call('POST', '/api/auth/signup', {
      companyName: 'AI Co', taxId: '1234567890123', address: 'x', contactPhone: '081-234-5678',
      contactPerson: 'C', email: 'c@test.com', password: 'password123',
    });
    master.prepare('UPDATE users SET approved = 1 WHERE email = ?').run('c@test.com');
    const user = await (await call('POST', '/api/auth/login', { email: 'c@test.com', password: 'password123' })).json();

    // Package A has no 'ai' feature by default
    let r = await call('GET', '/api/admin/packages', undefined, root.token);
    const pkgs = await r.json();
    const pkgA = pkgs.find(p => p.id === 'A');
    assert(pkgA && !pkgA.features.includes('ai'), 'package A does not include ai by default');
    r = await call('PUT', '/api/admin/tenants/' + user.tenant.id + '/package', { packageId: 'A' }, root.token);
    assert(r.ok, 'superuser assigns package A to the customer');

    r = await call('POST', '/api/ai/chat', { message: 'hi' }, (await (await call('POST', '/api/auth/login', { email: 'c@test.com', password: 'password123' })).json()).token);
    assert(r.status === 403, 'chat is forbidden when package lacks ai');

    // Superuser adds the ai feature to package A
    r = await call('PUT', '/api/admin/packages/A', { features: [...pkgA.features, 'ai'] }, root.token);
    assert(r.ok, 'superuser adds ai feature to package A');

    const token2 = (await (await call('POST', '/api/auth/login', { email: 'c@test.com', password: 'password123' })).json()).token;
    r = await call('POST', '/api/ai/chat', { message: 'hi' }, token2);
    assert(r.status === 503, 'chat passes the gate when package includes ai (no webhook configured -> 503)');

    // Unknown feature key is rejected
    r = await call('PUT', '/api/admin/packages/A', { features: ['nope'] }, root.token);
    assert(r.status === 400, 'unknown feature key still rejected');

    console.log('\nAll AI feature gate tests passed.');
  } finally {
    server.close();
    process.exit(0);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
