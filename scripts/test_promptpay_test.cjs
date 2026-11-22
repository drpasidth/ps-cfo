// Tests the superuser 1 THB PromptPay QR test endpoint. Uses a temporary DATA_DIR.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-pp-'));
process.env.DATA_DIR = dir;
const { app, master, promptpayPayload } = require('../server.cjs');

const assert = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('ok -', msg);
};

(async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const get = (p, token) => fetch(base + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const put = (p, body, token) => fetch(base + p, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'create-superuser.cjs'), 'root@test.com', 'rootpass123', 'Root'], { env: process.env });
    const root = await (await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'root@test.com', password: 'rootpass123' }),
    })).json();

    let r = await get('/api/admin/promptpay-test', root.token);
    assert(r.status === 400, 'returns 400 when PromptPay ID is not configured');

    r = await put('/api/admin/settings', { promptpayId: '0812345678', promptpayName: 'Test Co' }, root.token);
    assert(r.ok, 'superuser saves PromptPay settings');

    r = await get('/api/admin/promptpay-test');
    assert(r.status === 401, 'anonymous request rejected');

    r = await get('/api/admin/promptpay-test', root.token);
    assert(r.ok, 'superuser gets the test QR');
    const body = await r.json();
    assert(body.amount === 1, 'test QR amount is 1 baht');
    assert(body.accountName === 'Test Co', 'account name returned');
    assert(body.qrDataUrl.startsWith('data:image/png;base64,'), 'QR returned as PNG data URL');

    const payload = promptpayPayload('0812345678', 1);
    assert(payload.includes('54041.00'), 'payload encodes amount 1.00');
    assert(payload.includes('010212'), 'payload is dynamic (reusable QR is not used)');

    const count = master.prepare('SELECT COUNT(*) AS n FROM payments').get().n;
    assert(count === 0, 'test QR does not create a payment record');

    console.log('\nAll PromptPay test QR checks passed.');
  } finally {
    server.close();
    process.exit(0);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
