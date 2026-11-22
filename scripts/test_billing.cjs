// Checks the signup -> package -> QR -> slip -> approval flow and the trial / subscription rules.
// Uses a temporary data directory, so your real databases are not touched.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-billing-test-'));
const { app, master, hashPassword, promptpayPayload } = require('../server.cjs');

const failures = [];
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

// 1x1 transparent PNG
const SLIP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
  const now = new Date().toISOString();
  master.prepare('INSERT INTO tenants (id, name, db_file, created_at, package_id) VALUES (?,?,?,?,?)')
    .run('platform', 'Platform', 'tenants/platform.sqlite3', now, 'BB');
  master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_superuser, approved, created_at)
    VALUES (?,?,?,?,?,?,1,1,?)`).run(crypto.randomUUID(), 'platform', 'root@test.local', 'Root', hashPassword('password123'), 'owner', now);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
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
    // PromptPay payload: structure and CRC
    const crcOk = (p) => {
      const body = p.slice(0, -4);
      let crc = 0xFFFF;
      for (let i = 0; i < body.length; i++) {
        crc ^= body.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
      }
      return crc.toString(16).toUpperCase().padStart(4, '0') === p.slice(-4);
    };
    const root = (await call('POST', '/api/auth/login', null, { email: 'root@test.local', password: 'password123' })).json.token;
    check('invalid PromptPay ID rejected', (await call('PUT', '/api/admin/settings', root, { promptpayId: '12345' })).status === 400);
    check('PromptPay settings saved', (await call('PUT', '/api/admin/settings', root, { promptpayId: '081-234-5678', promptpayName: 'บริษัท ทดสอบ' })).status === 200);
    const settings = (await call('GET', '/api/admin/settings', root)).json;
    check('PromptPay ID stored without dashes', settings.promptpayId === '0812345678');
    check('webhook setting untouched by PromptPay save', settings.aiWebhookUrl === '');

    // Signup with company details -> logged in, pending approval, 1 month trial
    const signup = await call('POST', '/api/auth/signup', null, {
      email: 'co@test.local', password: 'password123', companyName: 'Co Ltd', taxId: '1234567890123',
      address: '1 Test Road', contactPhone: '0812345678', contactPerson: 'Owner',
    });
    check('signup accepted and logged in', signup.status === 201 && !!signup.json.token);
    check('signup returns unapproved user', signup.json.user.approved === false);
    const token = signup.json.token;
    const row = master.prepare('SELECT t.id, t.trial_ends_at FROM tenants t JOIN users u ON u.tenant_id = t.id WHERE u.email = ?').get('co@test.local');
    const days = (Date.parse(row.trial_ends_at) - Date.now()) / 86400000;
    check('trial is about one month', days > 27 && days < 32);
    check('signup rejects missing tax ID', (await call('POST', '/api/auth/signup', null, {
      email: 'x@test.local', password: 'password123', companyName: 'X', taxId: '12', address: 'a', contactPhone: '0812345678', contactPerson: 'X',
    })).status === 400);

    // Unapproved: only billing is open
    check('unapproved user blocked from data (403)', (await call('GET', '/api/kv', token)).status === 403);
    check('unapproved user can list packages', (await call('GET', '/api/billing/packages', token)).json.length === 4);
    const qr = await call('GET', '/api/billing/qr?packageId=A', token);
    check('QR for package A has price 990', qr.json.package?.price === 990);
    check('QR image generated', typeof qr.json.promptpay.qrDataUrl === 'string' && qr.json.promptpay.qrDataUrl.startsWith('data:image/png'));
    check('PromptPay account name shown', qr.json.promptpay.accountName === 'บริษัท ทดสอบ');
    check('QR for unknown package rejected', (await call('GET', '/api/billing/qr?packageId=ZZ', token)).status === 404);
    check('payment without slip rejected', (await call('POST', '/api/billing/payments', token, { packageId: 'A' })).status === 400);
    check('payment with non-image slip rejected', (await call('POST', '/api/billing/payments', token, { packageId: 'A', slip: 'data:application/pdf;base64,AAAA' })).status === 400);
    check('payment without package rejected', (await call('POST', '/api/billing/payments', token, { slip: SLIP })).status === 400);

    // Approve the account, then test expiry
    master.prepare('UPDATE users SET approved = 1 WHERE email = ?').run('co@test.local');
    const login = await call('POST', '/api/auth/login', null, { email: 'co@test.local', password: 'password123' });
    check('approved user logs in', login.status === 200);
    check('session reports trial status', login.json.tenant.subscription?.status === 'trial');
    check('trial user can read data', (await call('GET', '/api/kv', login.json.token)).status === 200);
    const userToken = login.json.token;
    const profile = (await call('GET', '/api/data', userToken)).json.company;
    check('company profile saved from signup', profile.companyName === 'Co Ltd' && profile.taxId === '1234567890123' && profile.contactPhone === '0812345678');

    master.prepare('UPDATE tenants SET trial_ends_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', row.id);
    check('expired tenant blocked from data (402)', (await call('GET', '/api/kv', userToken)).status === 402);
    check('expired tenant blocked from activities (402)', (await call('GET', '/api/data', userToken)).status === 402);
    const me = await call('GET', '/api/auth/me', userToken);
    check('expired session still readable (/me)', me.status === 200 && me.json.tenant.subscription.status === 'expired');
    check('expired tenant can see billing info', (await call('GET', '/api/billing/info', userToken)).status === 200);

    // Report payment: package + slip
    check('payment without body rejected', (await call('POST', '/api/billing/payments', userToken)).status === 400);
    check('payment reported with slip', (await call('POST', '/api/billing/payments', userToken, { packageId: 'A', slip: SLIP })).status === 201);
    check('second pending report rejected', (await call('POST', '/api/billing/payments', userToken, { packageId: 'A', slip: SLIP })).status === 409);
    const pending = (await call('GET', '/api/admin/payments', root)).json;
    check('superuser sees pending payment with slip', pending.length === 1 && pending[0].amount === 990 && pending[0].slip === SLIP);

    // Confirm -> package extended by one month, access restored
    const confirm = await call('POST', `/api/admin/payments/${pending[0].id}/confirm`, root);
    check('payment confirmed', confirm.status === 200);
    const paidMs = Date.parse(confirm.json.paidUntil) - Date.now();
    check('paid until about one month ahead', paidMs > 27 * 86400000 && paidMs < 32 * 86400000);
    check('tenant regains access after payment', (await call('GET', '/api/kv', userToken)).status === 200);
    check('session now shows active', (await call('GET', '/api/auth/me', userToken)).json.tenant.subscription.status === 'active');
    check('confirmed payment sets package', (await call('GET', '/api/billing/info', userToken)).json.package?.code === 'A');
    check('confirmed payment no longer pending', (await call('GET', '/api/admin/payments', root)).json.length === 0);
    check('confirming again fails', (await call('POST', `/api/admin/payments/${pending[0].id}/confirm`, root)).status === 404);

    // Unapproved signup approved by a confirmed payment
    const signup2 = await call('POST', '/api/auth/signup', null, {
      email: 'new@test.local', password: 'password123', companyName: 'New Co', taxId: '9876543210987',
      address: '2 Test Road', contactPhone: '0898765432', contactPerson: 'New',
    });
    const newToken = signup2.json.token;
    check('new signup cannot read data yet', (await call('GET', '/api/kv', newToken)).status === 403);
    check('new signup reports package BB with slip', (await call('POST', '/api/billing/payments', newToken, { packageId: 'BB', slip: SLIP })).status === 201);
    const newPending = (await call('GET', '/api/admin/payments', root)).json;
    check('superuser sees new payment for BB', newPending.length === 1 && newPending[0].package_id === 'BB');
    check('confirm new payment', (await call('POST', `/api/admin/payments/${newPending[0].id}/confirm`, root)).status === 200);
    check('new company approved after payment', (await call('GET', '/api/kv', newToken)).status === 200);

    // Reject flow
    master.prepare('UPDATE tenants SET paid_until = NULL, trial_ends_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', row.id);
    check('report again after reset', (await call('POST', '/api/billing/payments', userToken, { packageId: 'A', slip: SLIP })).status === 201);
    const again = (await call('GET', '/api/admin/payments', root)).json;
    check('reject pending payment', (await call('POST', `/api/admin/payments/${again[0].id}/reject`, root)).status === 200);

    // Superuser is never blocked
    check('superuser not blocked by expiry', (await call('GET', '/api/admin/tenants', root)).status === 200);

    // QR payload shape
    const payload = promptpayPayload('0812345678', 990);
    check('payload checksum valid (CRC)', !!payload && crcOk(payload));
    check('payload carries amount 990.00', !!payload && payload.includes('5406990.00'));
    check('payload uses phone target 0066812345678', !!payload && payload.includes('0066812345678'));
    check('static payload without amount', crcOk(promptpayPayload('0812345678', 0)) && !promptpayPayload('0812345678', 0).includes('5406'));
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
