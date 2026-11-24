const path = require('path');
// Load cfo_saas/.env (SMTP settings etc.) before any other module reads process.env.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Storage layout
//   data/master.sqlite3            – tenants, users, sessions (shared)
//   data/cfo.sqlite3               – legacy single-tenant DB (claimed by first signup)
//   data/tenants/<tenantId>.sqlite3 – one database per tenant
// ---------------------------------------------------------------------------
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const tenantDir = path.join(dataDir, 'tenants');
fs.mkdirSync(tenantDir, { recursive: true });

const LEGACY_DB_FILE = 'cfo.sqlite3';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PENDING_MESSAGE = 'บัญชียังไม่ได้รับการอนุมัติ กรุณารอผู้ดูแลระบบอนุมัติ';

const TENANT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS company_profile (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tenant_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
`;
const KV_KEY_RE = /^[A-Za-z0-9_.-]{1,100}$/;

const master = new Database(path.join(dataDir, 'master.sqlite3'));
master.pragma('journal_mode = WAL');
master.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    db_file TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_email TEXT,
    target_email TEXT,
    tenant_name TEXT,
    detail TEXT
  );
`);

// Logbook: records signups and approvals so the superuser can review them in the admin panel.
function logEvent(action, { actor = null, target = null, tenantName = null, detail = null } = {}) {
  try {
    master.prepare('INSERT INTO activity_log (created_at, action, actor_email, target_email, tenant_name, detail) VALUES (?,?,?,?,?,?)')
      .run(new Date().toISOString(), action, actor, target, tenantName, detail);
  } catch (err) {
    console.error('[logbook] บันทึกไม่สำเร็จ:', err.message);
  }
}
// Migrations for databases created before superuser / approval support.
// Existing accounts default to approved = 1 so current users keep access.
const userColumns = master.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColumns.includes('is_superuser')) {
  master.exec('ALTER TABLE users ADD COLUMN is_superuser INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('approved')) {
  master.exec('ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 1');
}
// Per-user permissions granted by the tenant admin (JSON, see RESOURCES / ACTIONS below).
if (!userColumns.includes('permissions')) {
  master.exec("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'");
}

// Register the existing single-tenant database so its data is kept.
if (fs.existsSync(path.join(dataDir, LEGACY_DB_FILE))
  && !master.prepare('SELECT 1 FROM tenants WHERE db_file = ?').get(LEGACY_DB_FILE)) {
  master.prepare('INSERT INTO tenants (id, name, db_file, created_at) VALUES (?,?,?,?)')
    .run('legacy', 'ข้อมูลเดิม', LEGACY_DB_FILE, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Membership packages. Features and prices are managed by the admin (superuser).
// Each tenant is assigned one package; the package decides which features it can use.
// ---------------------------------------------------------------------------
const FEATURE_KEYS = ['scope1', 'scope2', 'scope3', 'verification', 'report_word', 'ai'];
master.exec(`CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  features TEXT NOT NULL DEFAULT '[]'
);`);
const tenantColumns = master.prepare('PRAGMA table_info(tenants)').all().map(c => c.name);
if (!tenantColumns.includes('package_id')) master.exec('ALTER TABLE tenants ADD COLUMN package_id TEXT');
// Subscription: new companies get a 1-month trial (trial_ends_at); paid_until is set when a payment is confirmed.
if (!tenantColumns.includes('trial_ends_at')) {
  master.exec('ALTER TABLE tenants ADD COLUMN trial_ends_at TEXT');
  master.exec('ALTER TABLE tenants ADD COLUMN paid_until TEXT');
  // Companies that existed before the trial system keep full access.
  master.prepare("UPDATE tenants SET paid_until = '2999-12-31T00:00:00.000Z'").run();
}
master.exec(`CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  package_id TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);`);
// Transfer slip (data URL image) uploaded by the customer with the payment report.
const paymentColumns = master.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
if (!paymentColumns.includes('slip')) master.exec('ALTER TABLE payments ADD COLUMN slip TEXT');
// 'new' = full package price (trial end, expired, or first purchase); 'upgrade' = price difference, new 12-month term.
if (!paymentColumns.includes('kind')) master.exec("ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'new'");
const MAX_SLIP_CHARS = 7 * 1024 * 1024; // about 5 MB of image before Base64 encoding

const TRIAL_MONTHS = 1;
// Package prices are yearly rates, so a confirmed payment extends the subscription by 12 months.
const PAID_MONTHS = 12;
function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// Access state of a tenant: active (paid), trial, or expired.
function subscriptionOf(row) {
  const now = Date.now();
  const base = { trialEndsAt: row.trial_ends_at || null, paidUntil: row.paid_until || null };
  if (row.paid_until && Date.parse(row.paid_until) > now) return { status: 'active', ...base };
  if (row.trial_ends_at && Date.parse(row.trial_ends_at) > now) return { status: 'trial', ...base };
  return { status: 'expired', ...base };
}

// What the company has to pay for a package. An active paid company moving to a more expensive
// package pays only the price difference; the new package then starts a new 12-month term.
// Everything else (trial, expired, first purchase, same or lower package) pays the full price.
function paymentQuote(session, pkg) {
  const active = session.paid_until && Date.parse(session.paid_until) > Date.now();
  const current = active && session.package_id
    ? master.prepare('SELECT id, code, name, price FROM packages WHERE id = ?').get(session.package_id)
    : null;
  if (current && current.price > 0 && pkg.price > current.price && pkg.id !== current.id) {
    return { amount: pkg.price - current.price, kind: 'upgrade', from: current };
  }
  return { amount: pkg.price, kind: 'new', from: null };
}

// PromptPay (EMVCo) payload for a phone number, national/tax ID or e-wallet ID.
function crc16(text) {
  let crc = 0xFFFF;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function tlv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}
function promptpayTarget(id) {
  if (/^0\d{9}$/.test(id)) return tlv('01', '0066' + id.slice(1)); // mobile phone
  if (/^\d{13}$/.test(id)) return tlv('02', id);                     // national / tax ID
  if (/^\d{15}$/.test(id)) return tlv('03', id);                     // e-wallet ID
  return null;
}
function isPromptpayId(id) {
  return promptpayTarget(id) !== null;
}
function promptpayPayload(id, amount) {
  const target = promptpayTarget(id);
  if (!target) return null;
  let payload = tlv('00', '01') + tlv('01', amount ? '12' : '11')
    + tlv('29', tlv('00', 'A000000677010111') + target) + tlv('53', '764');
  if (amount) payload += tlv('54', Number(amount).toFixed(2));
  payload += tlv('58', 'TH') + '6304';
  return payload + crc16(payload);
}

// monthly = ราคาต่อเดือน, price = ราคาต่อปี (monthly x 12)
const DEFAULT_PACKAGES = [
  { id: 'A', name: 'Package A', description: 'Scope 1, Scope 2 และ Verification Sheet', monthly: 599, maxUsers: 1,
    features: ['scope1', 'scope2', 'verification'] },
  { id: 'AA', name: 'Package AA', description: 'Scope 1, Scope 2, Verification Sheet และรายงาน Word', monthly: 699, maxUsers: 5,
    features: ['scope1', 'scope2', 'verification', 'report_word'] },
  { id: 'B', name: 'Package B', description: 'Scope 1-3, Verification Sheet และ AI Assistant', monthly: 999, maxUsers: 10,
    features: ['scope1', 'scope2', 'scope3', 'verification', 'ai'] },
  { id: 'BB', name: 'Package BB', description: 'Scope 1-3, Verification Sheet, รายงาน Word และ AI Assistant', monthly: 1299, maxUsers: 20,
    features: ['scope1', 'scope2', 'scope3', 'verification', 'report_word', 'ai'] },
].map(p => ({ ...p, price: p.monthly * 12 }));

// Monthly and yearly prices from a request. Monthly wins if given; otherwise yearly is used.
function parsePrices(b, fallback) {
  if (b.monthlyPrice !== undefined && b.monthlyPrice !== '') {
    const monthly = Number(b.monthlyPrice);
    if (!Number.isFinite(monthly) || monthly < 0) return null;
    return { monthly, price: monthly * 12 };
  }
  const price = b.price === undefined || b.price === '' ? fallback.price : Number(b.price);
  if (!Number.isFinite(price) || price < 0) return null;
  return { monthly: price / 12, price };
}
// Number of users (including the tenant admin) a package allows.
const packageColumns = master.prepare('PRAGMA table_info(packages)').all().map(c => c.name);
const addMaxUsers = !packageColumns.includes('max_users');
if (addMaxUsers) master.exec('ALTER TABLE packages ADD COLUMN max_users INTEGER NOT NULL DEFAULT 1');
const insertPackage = master.prepare(`INSERT OR IGNORE INTO packages (id, code, name, description, price, features, max_users)
  VALUES (?,?,?,?,?,?,?)`);
for (const p of DEFAULT_PACKAGES) insertPackage.run(p.id, p.id, p.name, p.description, p.price, JSON.stringify(p.features), p.maxUsers);
if (addMaxUsers) {
  for (const p of DEFAULT_PACKAGES) master.prepare('UPDATE packages SET max_users = ? WHERE id = ?').run(p.maxUsers, p.id);
}
// Monthly price (yearly price = monthly x 12). Existing packages get it from their yearly price.
if (!packageColumns.includes('monthly_price')) {
  master.exec('ALTER TABLE packages ADD COLUMN monthly_price REAL NOT NULL DEFAULT 0');
  master.exec('UPDATE packages SET monthly_price = price / 12.0');
}
// Companies that existed before packages keep full access.
master.prepare("UPDATE tenants SET package_id = 'BB' WHERE package_id IS NULL").run();

// Open tenant databases lazily and cache the handles.
const tenantDbs = new Map();
function getTenantDb(dbFile) {
  if (!tenantDbs.has(dbFile)) {
    const db = new Database(path.join(dataDir, dbFile));
    db.pragma('journal_mode = WAL');
    db.exec(TENANT_SCHEMA);
    tenantDbs.set(dbFile, db);
  }
  return tenantDbs.get(dbFile);
}

// ---------------------------------------------------------------------------
// Passwords and sessions
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  master.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)')
    .run(token, userId, Date.now() + SESSION_TTL_MS);
  return token;
}

function findSession(token) {
  const row = master.prepare(`
    SELECT s.expires_at, u.id AS user_id, u.email, u.name, u.role, u.is_superuser, u.approved, u.permissions,
           t.id AS tenant_id, t.name AS tenant_name, t.db_file, t.trial_ends_at, t.paid_until,
           p.id AS package_id, p.code AS package_code, p.name AS package_name, p.features AS package_features, p.max_users AS package_max_users
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN tenants t ON t.id = u.tenant_id
    LEFT JOIN packages p ON p.id = t.package_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    master.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

function bearerToken(req) {
  const match = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  return match ? match[1] : null;
}

// Resolves the logged-in user, their tenant, and that tenant's database.
function requireAuth(req, res, next) {
  const token = bearerToken(req);
  const session = token && findSession(token);
  if (!session) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  // Accounts waiting for approval can only choose a package, pay and upload the slip (billing) and read /me.
  const billingOrMe = req.path.startsWith('/api/billing') || req.path === '/api/auth/me';
  if (!session.approved && !billingOrMe) return res.status(403).json({ error: PENDING_MESSAGE, pending: true });
  // Expired trial / unpaid subscription: only billing and the session check remain available.
  const allowedWhenExpired = billingOrMe;
  if (subscriptionOf(session).status === 'expired' && !session.is_superuser && !allowedWhenExpired) {
    return res.status(402).json({ error: 'หมดอายุการทดลองใช้ กรุณาชำระค่าสมาชิกเพื่อใช้งานต่อ', expired: true });
  }
  req.token = token;
  req.session = session;
  req.db = getTenantDb(session.db_file);
  next();
}

// Platform superusers only (accounts created with scripts/create-superuser.cjs).
function requireSuperuser(req, res, next) {
  if (!req.session.is_superuser) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
  next();
}

// ---------------------------------------------------------------------------
// Roles and permissions
//   tenant_admin – the company's first account (created at signup). Manages the team and their permissions.
//   member       – added by a tenant admin; can only do what the admin grants per resource.
//   (legacy 'owner' accounts are treated as tenant_admin.)
// ---------------------------------------------------------------------------
const RESOURCES = ['activities', 'company', 'settings'];
const ACTIONS = ['create', 'read', 'update', 'delete'];
const PERMISSION_DENIED = 'ไม่มีสิทธิ์ดำเนินการนี้ กรุณาติดต่อผู้ดูแลบริษัท';

function isTenantAdmin(role) {
  return role === 'tenant_admin' || role === 'owner';
}
function cleanPermissions(input) {
  const out = {};
  for (const r of RESOURCES) {
    out[r] = {};
    for (const a of ACTIONS) out[r][a] = !!input?.[r]?.[a];
  }
  return out;
}
function parsePermissions(text) {
  try { return cleanPermissions(JSON.parse(text || '{}')); } catch { return cleanPermissions({}); }
}
const FULL_PERMISSIONS = cleanPermissions(Object.fromEntries(
  RESOURCES.map(r => [r, Object.fromEntries(ACTIONS.map(a => [a, true]))]),
));
// New members can read everything by default; the admin grants write access.
const DEFAULT_MEMBER_PERMISSIONS = cleanPermissions({
  activities: { read: true }, company: { read: true }, settings: { read: true },
});
function effectivePermissions(role, storedJson, isSuperuser) {
  if (isSuperuser || isTenantAdmin(role)) return FULL_PERMISSIONS;
  return parsePermissions(storedJson);
}
function can(session, resource, action) {
  return !!effectivePermissions(session.role, session.permissions, session.is_superuser)[resource]?.[action];
}
function requirePermission(resource, action) {
  return (req, res, next) => (can(req.session, resource, action)
    ? next()
    : res.status(403).json({ error: PERMISSION_DENIED }));
}
function requireTenantAdmin(req, res, next) {
  if (!isTenantAdmin(req.session.role) && !req.session.is_superuser) {
    return res.status(403).json({ error: PERMISSION_DENIED });
  }
  next();
}
// JSON with sorted keys, so the same data always produces the same text (used to detect changes).
function canonicalJson(value) {
  return JSON.stringify(value, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]]))
    : v));
}

function publicSession(session) {
  return {
    user: {
      id: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
      isTenantAdmin: isTenantAdmin(session.role),
      isSuperuser: !!session.is_superuser,
      approved: !!session.approved,
      permissions: effectivePermissions(session.role, session.permissions, session.is_superuser),
    },
    tenant: {
      id: session.tenant_id,
      name: session.tenant_name,
      subscription: subscriptionOf(session),
      package: session.package_id ? {
        id: session.package_id,
        code: session.package_code,
        name: session.package_name,
        features: JSON.parse(session.package_features || '[]'),
        maxUsers: session.package_max_users ?? 1,
      } : null,
    },
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
// Company profile images are stored in the company_profile SQLite record as data URLs.
// Allow enough payload for three images (up to 8 MB each before Base64 encoding).
app.use(express.json({ limit: '40mb' }));

app.post('/api/auth/signup', (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const companyName = String(b.companyName || '').trim();
  const taxId = String(b.taxId || '').replace(/[\s-]/g, '');
  const address = String(b.address || '').trim();
  const contactPhone = String(b.contactPhone || '').trim();
  const contactPerson = String(b.contactPerson || '').trim();

  if (!companyName) return res.status(400).json({ error: 'กรุณากรอกชื่อบริษัท' });
  if (!/^\d{13}$/.test(taxId)) return res.status(400).json({ error: 'เลขนิติบุคคลต้องเป็นตัวเลข 13 หลัก' });
  if (!address) return res.status(400).json({ error: 'กรุณากรอกที่อยู่บริษัท' });
  if (!/^\+?[\d\s-]{9,20}$/.test(contactPhone)) return res.status(400).json({ error: 'เบอร์โทรไม่ถูกต้อง' });
  if (!contactPerson) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ติดต่อ' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });
  if (password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  if (master.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
  }

  // Every signup gets its own empty company and a free 1-month trial, but the account must be approved
  // by a superuser first (approved = 0). The trial clock (trial_ends_at) starts when the account is
  // approved, see POST /api/admin/users/:id/approve. The trial uses the full BB package so every
  // feature is available; when the trial ends the company chooses a package and pays by QR.
  const now = new Date().toISOString();
  const tenantId = crypto.randomUUID();
  const tenantFile = `tenants/${tenantId}.sqlite3`;
  const TRIAL_PACKAGE_ID = 'BB';
  master.transaction(() => {
    master.prepare('INSERT INTO tenants (id, name, db_file, created_at, package_id, trial_ends_at) VALUES (?,?,?,?,?,?)')
      .run(tenantId, companyName, tenantFile, now, TRIAL_PACKAGE_ID, null);
    master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, approved, created_at)
      VALUES (?,?,?,?,?,?,0,?)`).run(crypto.randomUUID(), tenantId, email, contactPerson, hashPassword(password), 'tenant_admin', now);
  })();
  getTenantDb(tenantFile).prepare('INSERT INTO company_profile (id, data) VALUES (1, ?)').run(JSON.stringify({
    companyName,
    taxId,
    address,
    contactPerson,
    contactPhone,
    contactEmail: email,
  }));

  logEvent('signup', { target: email, tenantName: companyName, detail: `ผู้ติดต่อ: ${contactPerson}, เบอร์: ${contactPhone}` });

  // Notify the superuser and acknowledge the applicant. Emails are fire-and-forget: a failure is
  // logged and never blocks the signup.
  const superuserEmail = getSetting('superuser_email');
  sendMail(
    superuserEmail,
    `[CFO Carbon] มีผู้สมัครใช้งานฟรี รอการอนุมัติ: ${companyName}`,
    [
      'มีผู้สมัครใช้งานฟรี (trial 1 เดือน) และรอการอนุมัติ',
      '',
      `บริษัท: ${companyName}`,
      `เลขนิติบุคคล: ${taxId}`,
      `ที่อยู่: ${address}`,
      `ผู้ติดต่อ: ${contactPerson}`,
      `เบอร์โทร: ${contactPhone}`,
      `อีเมล: ${email}`,
      '',
      'กรุณาเข้าสู่ระบบ CFO Carbon ที่หน้า Admin เพื่อตรวจสอบและอนุมัติบัญชี',
      'ผู้สมัครจะยังใช้งานไม่ได้จนกว่าจะได้รับการอนุมัติ',
    ].join('\n'),
  );
  sendMail(
    email,
    'CFO Carbon: ได้รับใบสมัครของคุณแล้ว รอการอนุมัติ',
    [
      `เรียน ${contactPerson}`,
      '',
      `ขอบคุณที่สมัครใช้งาน CFO Carbon สำหรับบริษัท ${companyName}`,
      'เราได้รับใบสมัครใช้งานฟรีของคุณแล้ว ขณะนี้อยู่ระหว่างรอการอนุมัติจากผู้ดูแลระบบ',
      'คุณจะยังไม่สามารถใช้งานระบบได้จนกว่าบัญชีจะได้รับการอนุมัติ เมื่ออนุมัติแล้วจะมีอีเมลแจ้งให้ทราบ',
      '',
      'CFO Carbon',
    ].join('\n'),
  );

  const token = createSession(master.prepare('SELECT id FROM users WHERE email = ?').get(email).id);
  res.status(201).json({ token, ...publicSession(findSession(token)) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = master.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  // Unapproved accounts can log in, but only reach the package / payment page (see requireAuth).
  const token = createSession(user.id);
  const session = findSession(token);
  res.json({ token, ...publicSession(session) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) master.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(publicSession(req.session));
});

// ---------------------------------------------------------------------------
// Team: the tenant admin adds members (up to the package's user limit) and sets what each may do.
// ---------------------------------------------------------------------------
function maxUsersOf(session) {
  return master.prepare('SELECT max_users FROM packages WHERE id = ?').get(session.package_id)?.max_users ?? 1;
}
function memberOf(tenantId, userId) {
  return master.prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?').get(userId, tenantId);
}
function parseMaxUsers(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Backup: a consistent single-file copy of this tenant's database (activities, company, settings).
app.get('/api/tenant/backup', requireAuth, requireTenantAdmin, (req, res) => {
  const tmpFile = path.join(require('os').tmpdir(), `cfo-backup-${crypto.randomUUID()}.sqlite3`);
  try {
    req.db.prepare('VACUUM INTO ?').run(tmpFile);
  } catch (err) {
    console.error('[backup] ไม่สำเร็จ:', err.message);
    return res.status(500).json({ error: 'สร้างไฟล์สำรองข้อมูลไม่สำเร็จ' });
  }
  const date = new Date().toISOString().slice(0, 10);
  logEvent('backup', { actor: req.session.email, tenantName: req.session.tenant_name });
  const safeName = (req.session.tenant_name || 'company').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim() || 'company';
  res.download(tmpFile, `${safeName}-${date}.sqlite3`, () => {
    fs.rm(tmpFile, { force: true }, () => {});
  });
});

app.get('/api/team', requireAuth, requireTenantAdmin, (req, res) => {
  const users = master.prepare('SELECT id, email, name, role, permissions, created_at FROM users WHERE tenant_id = ? ORDER BY created_at')
    .all(req.session.tenant_id);
  res.json({
    maxUsers: maxUsersOf(req.session),
    used: users.length,
    resources: RESOURCES,
    actions: ACTIONS,
    members: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isTenantAdmin: isTenantAdmin(u.role),
      permissions: isTenantAdmin(u.role) ? FULL_PERMISSIONS : parsePermissions(u.permissions),
      createdAt: u.created_at,
    })),
  });
});

app.post('/api/team', requireAuth, requireTenantAdmin, (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้งาน' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });
  if (password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  const max = maxUsersOf(req.session);
  const used = master.prepare('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?').get(req.session.tenant_id).n;
  if (used >= max) {
    return res.status(403).json({ error: `แพ็กเกจของคุณรองรับผู้ใช้งานได้สูงสุด ${max} คน (ใช้แล้ว ${used} คน) กรุณาอัปเกรดแพ็กเกจ` });
  }
  if (master.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
  }
  const id = crypto.randomUUID();
  // Team members are approved as soon as they are created: the company is already approved.
  master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, approved, permissions, created_at)
    VALUES (?,?,?,?,?,'member',1,?,?)`).run(id, req.session.tenant_id, email, name, hashPassword(password),
    JSON.stringify(cleanPermissions(b.permissions ?? DEFAULT_MEMBER_PERMISSIONS)), new Date().toISOString());
  res.status(201).json({ ok: true, id });
});

app.put('/api/team/:id', requireAuth, requireTenantAdmin, (req, res) => {
  const target = memberOf(req.session.tenant_id, req.params.id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
  if (isTenantAdmin(target.role)) return res.status(400).json({ error: 'ไม่สามารถแก้ไขผู้ดูแลบริษัทในหน้านี้ได้' });
  const b = req.body || {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้งาน' });
    master.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, target.id);
  }
  if (b.password) {
    if (String(b.password).length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    master.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password)), target.id);
  }
  if (b.permissions !== undefined) {
    master.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(cleanPermissions(b.permissions)), target.id);
  }
  res.json({ ok: true });
});

app.delete('/api/team/:id', requireAuth, requireTenantAdmin, (req, res) => {
  const target = memberOf(req.session.tenant_id, req.params.id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
  if (isTenantAdmin(target.role)) return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลบริษัทได้' });
  master.transaction(() => {
    master.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    master.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  })();
  res.json({ ok: true });
});

// Superuser: overview of every tenant, its users and its data volume.
app.get('/api/admin/tenants', requireAuth, requireSuperuser, (req, res) => {
  const tenants = master.prepare('SELECT id, name, db_file, created_at, package_id, trial_ends_at, paid_until FROM tenants ORDER BY created_at').all();
  const users = master.prepare('SELECT id, tenant_id, email, name, role, is_superuser, approved, created_at FROM users ORDER BY created_at').all();
  res.json(tenants.map(t => {
    const db = getTenantDb(t.db_file);
    const company = db.prepare('SELECT data FROM company_profile WHERE id=1').get();
    return {
      id: t.id,
      name: t.name,
      createdAt: t.created_at,
      packageId: t.package_id,
      subscription: subscriptionOf(t),
      companyName: company ? (JSON.parse(company.data).companyName || '') : '',
      activityCount: db.prepare('SELECT COUNT(*) AS n FROM activities').get().n,
      users: users.filter(u => u.tenant_id === t.id).map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isSuperuser: !!u.is_superuser,
        approved: !!u.approved,
        createdAt: u.created_at,
      })),
    };
  }));
});

// Superuser: change a user's role to Tenant admin ('tenant_admin') or User ('member').
app.put('/api/admin/users/:id/role', requireAuth, requireSuperuser, (req, res) => {
  const role = String(req.body?.role || '');
  if (!['tenant_admin', 'member'].includes(role)) return res.status(400).json({ error: 'บทบาทไม่ถูกต้อง' });
  if (req.params.id === req.session.user_id) return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' });
  const result = master.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const user = master.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id);
  logEvent('change_role', { actor: req.session.email, target: user.email, detail: `บทบาทใหม่: ${role}` });
  res.json({ ok: true });
});

// Superuser: approve a pending account so it can log in.
app.post('/api/admin/users/:id/approve', requireAuth, requireSuperuser, (req, res) => {
  const result = master.prepare('UPDATE users SET approved = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const user = master.prepare(`SELECT u.email, u.name, u.tenant_id, t.name AS tenant_name, t.package_id AS tenant_package_id FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`).get(req.params.id);
  // If the company has a slip waiting, approving the user also confirms that payment (same as the
  // payment confirm button): status becomes confirmed, the package is set and paid_until is extended by one month.
  const pending = master.prepare("SELECT * FROM payments WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(user.tenant_id);
  if (pending) {
    const tenantRow = master.prepare('SELECT paid_until FROM tenants WHERE id = ?').get(user.tenant_id);
    const now = Date.now();
    const base = tenantRow?.paid_until && Date.parse(tenantRow.paid_until) > now ? tenantRow.paid_until : new Date(now).toISOString();
    const paidUntil = addMonths(base, PAID_MONTHS);
    master.transaction(() => {
      master.prepare("UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(new Date().toISOString(), pending.id);
      master.prepare('UPDATE tenants SET paid_until = ?, package_id = ? WHERE id = ?').run(paidUntil, pending.package_id, user.tenant_id);
      master.prepare('UPDATE users SET approved = 1 WHERE tenant_id = ?').run(user.tenant_id);
    })();
    logEvent('payment_confirm', { actor: req.session.email, tenantName: user.tenant_name, detail: `ยืนยันจากการอนุมัติผู้ใช้, ใช้ได้ถึง ${new Date(paidUntil).toLocaleDateString('th-TH')}` });
  }
  // Package: the package the company chose on its latest payment slip (this is what the customer paid for).
  // Fall back to the company's current package only if there is no payment.
  // Only confirmed payments count (rejected or pending slips never set the package).
  const latestPayment = master.prepare("SELECT package_id FROM payments WHERE tenant_id = ? AND status = 'confirmed' ORDER BY created_at DESC LIMIT 1").get(user.tenant_id);
  const pkgId = latestPayment?.package_id || user.tenant_package_id || null;
  if (pkgId && pkgId !== user.tenant_package_id) {
    master.prepare('UPDATE tenants SET package_id = ? WHERE id = ?').run(pkgId, user.tenant_id);
  }
  // Free-trial signups have no trial clock until approval: start the 1-month trial now.
  master.prepare('UPDATE tenants SET trial_ends_at = ? WHERE id = ? AND trial_ends_at IS NULL AND paid_until IS NULL')
    .run(addMonths(new Date().toISOString(), TRIAL_MONTHS), user.tenant_id);
  const pkgRow = pkgId ? master.prepare('SELECT code, name FROM packages WHERE id = ?').get(pkgId) : null;
  const pkgLabel = pkgRow ? `${pkgRow.code} – ${pkgRow.name}` : 'ยังไม่ได้เลือกแพ็กเกจ';
  logEvent('approve_user', { actor: req.session.email, target: user.email, tenantName: user.tenant_name, detail: `แพ็กเกจ: ${pkgLabel}` });
  // Notify the approved user. Failures are logged only, so approval still succeeds.
  sendMail(
    user.email,
    'CFO Carbon: บัญชีของคุณได้รับการอนุมัติแล้ว',
    [
      `เรียน ${user.name || 'ผู้ใช้งาน'}`,
      '',
      `บัญชีของคุณสำหรับบริษัท ${user.tenant_name || '-'} ได้รับการอนุมัติแล้ว`,
      `แพ็กเกจ: ${pkgLabel}`,
      `คุณสามารถเข้าสู่ระบบด้วยอีเมล ${user.email} และรหัสผ่านที่ตั้งไว้ได้ทันที`,
      '',
      'CFO Carbon',
    ].join('\n'),
  );
  res.json({ ok: true });
});

// Superuser: view the logbook (latest 500 entries, newest first).
app.get('/api/admin/logs', requireAuth, requireSuperuser, (req, res) => {
  const rows = master.prepare('SELECT id, created_at, action, actor_email, target_email, tenant_name, detail FROM activity_log ORDER BY id DESC LIMIT 500').all();
  res.json(rows.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    actorEmail: r.actor_email,
    targetEmail: r.target_email,
    tenantName: r.tenant_name,
    detail: r.detail,
  })));
});

// Superuser: list packages with their features and prices.
function listPackages() {
  return master.prepare('SELECT id, code, name, description, price, monthly_price, currency, features, max_users FROM packages ORDER BY price')
    .all()
    .map(({ max_users, features, ...p }) => ({ ...p, features: JSON.parse(features), maxUsers: max_users }));
}

app.get('/api/admin/packages', requireAuth, requireSuperuser, (req, res) => {
  res.json(listPackages());
});

// Superuser: change a package's name, description, price and features.
app.put('/api/admin/packages/:id', requireAuth, requireSuperuser, (req, res) => {
  const current = master.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'ไม่พบแพ็กเกจ' });
  const b = req.body || {};
  const name = String(b.name ?? current.name).trim();
  const description = String(b.description ?? current.description);
  const prices = (b.monthlyPrice === undefined && b.price === undefined)
    ? { monthly: current.monthly_price, price: current.price }
    : parsePrices(b, { price: current.price });
  const features = b.features === undefined ? JSON.parse(current.features) : b.features;
  const maxUsers = parseMaxUsers(b.maxUsers, current.max_users);
  if (maxUsers === null) return res.status(400).json({ error: 'จำนวนผู้ใช้งานต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป' });
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อแพ็กเกจ' });
  if (!prices) return res.status(400).json({ error: 'ราคาต้องเป็นตัวเลขที่ไม่ติดลบ' });
  if (!Array.isArray(features) || features.some(f => !FEATURE_KEYS.includes(f))) {
    return res.status(400).json({ error: 'ฟีเจอร์ไม่ถูกต้อง' });
  }
  master.prepare('UPDATE packages SET name = ?, description = ?, price = ?, monthly_price = ?, features = ?, max_users = ? WHERE id = ?')
    .run(name, description, prices.price, prices.monthly, JSON.stringify([...new Set(features)]), maxUsers, current.id);
  res.json({ ok: true });
});

// Superuser: create a new package. The code (e.g. "C") is also its id.
app.post('/api/admin/packages', requireAuth, requireSuperuser, (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase();
  const name = String(b.name || '').trim();
  const description = String(b.description ?? '');
  const prices = parsePrices(b, { price: 0 });
  const features = Array.isArray(b.features) ? [...new Set(b.features)] : [];
  const maxUsers = parseMaxUsers(b.maxUsers, 1);
  if (maxUsers === null) return res.status(400).json({ error: 'จำนวนผู้ใช้งานต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป' });
  if (!/^[A-Z0-9_-]{1,20}$/.test(code)) {
    return res.status(400).json({ error: 'รหัสแพ็กเกจต้องเป็น A-Z, 0-9, _ หรือ - ไม่เกิน 20 ตัวอักษร' });
  }
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อแพ็กเกจ' });
  if (!prices) return res.status(400).json({ error: 'ราคาต้องเป็นตัวเลขที่ไม่ติดลบ' });
  const price = prices.price;
  if (features.some(f => !FEATURE_KEYS.includes(f))) return res.status(400).json({ error: 'ฟีเจอร์ไม่ถูกต้อง' });
  if (master.prepare('SELECT id FROM packages WHERE id = ?').get(code)) {
    return res.status(409).json({ error: `มีแพ็กเกจรหัส ${code} อยู่แล้ว` });
  }
  master.prepare('INSERT INTO packages (id, code, name, description, price, monthly_price, features, max_users) VALUES (?,?,?,?,?,?,?,?)')
    .run(code, code, name, description, price, prices.monthly, JSON.stringify(features), maxUsers);
  res.json({ ok: true, id: code });
});

// Superuser: assign a package to a tenant (company).
app.put('/api/admin/tenants/:id/package', requireAuth, requireSuperuser, (req, res) => {
  const pkg = master.prepare('SELECT id FROM packages WHERE id = ?').get(String(req.body?.packageId || ''));
  if (!pkg) return res.status(400).json({ error: 'ไม่พบแพ็กเกจ' });
  const result = master.prepare('UPDATE tenants SET package_id = ? WHERE id = ?').run(pkg.id, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'ไม่พบบริษัท' });
  res.json({ ok: true });
});

// Superuser: edit a tenant's display name and company name.
app.put('/api/admin/tenants/:id', requireAuth, requireSuperuser, (req, res) => {
  const tenant = master.prepare('SELECT id, db_file FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'ไม่พบบริษัท' });
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  const companyName = String(b.companyName ?? '').trim();
  if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อบริษัท' });
  if (name.length > 200 || companyName.length > 200) return res.status(400).json({ error: 'ชื่อยาวเกิน 200 ตัวอักษร' });

  master.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(name, tenant.id);
  const db = getTenantDb(tenant.db_file);
  const row = db.prepare('SELECT data FROM company_profile WHERE id=1').get();
  const profile = row ? JSON.parse(row.data) : {};
  profile.companyName = companyName;
  db.prepare('INSERT OR REPLACE INTO company_profile (id, data) VALUES (1, ?)').run(JSON.stringify(profile));
  res.json({ ok: true });
});

// Superuser: permanently delete a tenant (company) with its users, sessions, payments and database file.
app.delete('/api/admin/tenants/:id', requireAuth, requireSuperuser, (req, res) => {
  const tenant = master.prepare('SELECT id, db_file FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'ไม่พบบริษัท' });
  if (tenant.id === req.session.tenant_id) {
    return res.status(400).json({ error: 'ไม่สามารถลบบริษัทที่ใช้งานอยู่ของผู้ดูแลระบบเองได้' });
  }

  master.transaction(() => {
    master.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)').run(tenant.id);
    master.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenant.id);
    master.prepare('DELETE FROM payments WHERE tenant_id = ?').run(tenant.id);
    master.prepare('DELETE FROM tenants WHERE id = ?').run(tenant.id);
  })();

  // Close the cached connection, then remove the tenant's database files.
  // Only files inside the tenants folder are removed (never the shared or legacy database).
  const cached = tenantDbs.get(tenant.db_file);
  if (cached) {
    cached.close();
    tenantDbs.delete(tenant.db_file);
  }
  const dbPath = path.resolve(dataDir, tenant.db_file);
  if (path.dirname(dbPath) === path.resolve(tenantDir)) {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  }
  res.json({ ok: true });
});

// Global app settings (superuser-managed), e.g. the AI assistant webhook URL.
master.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
const getSetting = (key) => master.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || '';
const setSetting = (key, value) => master.prepare(
  'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
).run(key, value);

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

// Outgoing email. SMTP credentials come from environment variables (never stored in the database):
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM (optional, defaults to SMTP_USER)
//   SMTP_SECURE=true for port 465
// The superuser notification address is set in the admin panel (app_settings: superuser_email).
let mailTransport = null;
function getMailTransport() {
  if (mailTransport !== null) return mailTransport;
  if (!process.env.SMTP_HOST) { mailTransport = false; return mailTransport; }
  mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return mailTransport;
}

// Sends an email and throws on failure (used by the admin test button).
async function deliverMail(to, subject, text) {
  const transport = getMailTransport();
  if (!transport) throw new Error('ยังไม่ได้ตั้งค่า SMTP_HOST ในไฟล์ .env');
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

// Sends an email; failures are logged and never break the request that triggered them.
async function sendMail(to, subject, text) {
  if (!to) return;
  try {
    await deliverMail(to, subject, text);
  } catch (err) {
    console.error(`[mail] ส่งอีเมลถึง ${to} ไม่สำเร็จ:`, err.message);
  }
}

app.get('/api/admin/settings', requireAuth, requireSuperuser, (req, res) => {
  res.json({
    aiWebhookUrl: getSetting('ai_webhook_url'),
    promptpayId: getSetting('promptpay_id'),
    promptpayName: getSetting('promptpay_name'),
    superuserEmail: getSetting('superuser_email'),
  });
});

app.put('/api/admin/settings', requireAuth, requireSuperuser, (req, res) => {
  const b = req.body || {};
  if ('aiWebhookUrl' in b) {
    const url = String(b.aiWebhookUrl || '').trim();
    if (url && !isHttpUrl(url)) return res.status(400).json({ error: 'URL ต้องขึ้นต้นด้วย http:// หรือ https://' });
    setSetting('ai_webhook_url', url);
  }
  if ('promptpayId' in b) {
    const id = String(b.promptpayId || '').replace(/[\s-]/g, '');
    if (id && !isPromptpayId(id)) {
      return res.status(400).json({ error: 'PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก, เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก หรือ e-Wallet 15 หลัก' });
    }
    setSetting('promptpay_id', id);
  }
  if ('promptpayName' in b) setSetting('promptpay_name', String(b.promptpayName || '').trim());
  if ('superuserEmail' in b) {
    const email = String(b.superuserEmail || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'อีเมลผู้ดูแลระบบไม่ถูกต้อง' });
    setSetting('superuser_email', email);
  }
  res.json({ ok: true });
});

// Superuser: generate a 1 THB PromptPay QR from the saved account to test that payments scan correctly.
// Read-only: nothing is stored.
app.get('/api/admin/promptpay-test', requireAuth, requireSuperuser, async (req, res) => {
  const promptpayId = getSetting('promptpay_id');
  if (!promptpayId) return res.status(400).json({ error: 'กรุณาตั้งค่า PromptPay ID ก่อนทดสอบ' });
  const payload = promptpayPayload(promptpayId, 1);
  if (!payload) return res.status(400).json({ error: 'PromptPay ID ไม่ถูกต้อง' });
  const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 300 });
  res.json({ amount: 1, accountName: getSetting('promptpay_name'), qrDataUrl });
});

// ---------------------------------------------------------------------------
// Billing: after the trial, the company pays the package price by PromptPay QR.
// The customer reports the payment; a superuser checks the bank account and confirms it.
// ---------------------------------------------------------------------------
app.get('/api/billing/info', requireAuth, (req, res) => {
  const pkg = req.session.package_id
    ? master.prepare('SELECT id, code, name, price, currency FROM packages WHERE id = ?').get(req.session.package_id)
    : null;
  const payments = master.prepare(`SELECT id, package_id, amount, status, created_at, confirmed_at FROM payments
    WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10`).all(req.session.tenant_id);
  res.json({
    approved: !!req.session.approved,
    subscription: subscriptionOf(req.session),
    package: pkg || null,
    payments,
  });
});

// Packages a customer can choose from.
app.get('/api/billing/packages', requireAuth, (req, res) => {
  res.json(listPackages());
});

// QR code to pay the chosen package's price by PromptPay.
app.get('/api/billing/qr', requireAuth, async (req, res) => {
  const pkg = master.prepare('SELECT id, code, name, price, currency FROM packages WHERE id = ?')
    .get(String(req.query.packageId || ''));
  if (!pkg) return res.status(404).json({ error: 'ไม่พบแพ็กเกจ' });
  if (!(pkg.price > 0)) return res.status(400).json({ error: 'แพ็กเกจนี้ไม่มีค่าใช้จ่าย' });
  const quote = paymentQuote(req.session, pkg);
  const promptpayId = getSetting('promptpay_id');
  let qrDataUrl = null;
  if (promptpayId) {
    const payload = promptpayPayload(promptpayId, quote.amount);
    if (payload) qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 300 });
  }
  res.json({
    package: pkg,
    amount: quote.amount,
    kind: quote.kind,
    upgradeFrom: quote.from,
    promptpay: { accountName: getSetting('promptpay_name'), configured: !!promptpayId, qrDataUrl },
  });
});

// Customer: choose a package, pay by QR and upload the transfer slip. A superuser approves it.
app.post('/api/billing/payments', requireAuth, async (req, res) => {
  const pkg = master.prepare('SELECT id, price FROM packages WHERE id = ?').get(String(req.body?.packageId || ''));
  if (!pkg) return res.status(400).json({ error: 'กรุณาเลือกแพ็กเกจ' });
  if (!(pkg.price > 0)) return res.status(400).json({ error: 'แพ็กเกจนี้ไม่มีค่าใช้จ่าย' });
  const slip = String(req.body?.slip || '');
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(slip)) {
    return res.status(400).json({ error: 'กรุณาแนบสลิปการโอนเป็นไฟล์รูปภาพ (PNG, JPG หรือ WEBP)' });
  }
  if (slip.length > MAX_SLIP_CHARS) return res.status(400).json({ error: 'ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB' });
  const pending = master.prepare("SELECT id FROM payments WHERE tenant_id = ? AND status = 'pending'").get(req.session.tenant_id);
  if (pending) return res.status(409).json({ error: 'มีรายการที่รอการอนุมัติอยู่แล้ว' });
  const quote = paymentQuote(req.session, pkg);
  master.prepare(`INSERT INTO payments (id, tenant_id, package_id, amount, status, created_at, slip, kind) VALUES (?,?,?,?,'pending',?,?,?)`)
    .run(crypto.randomUUID(), req.session.tenant_id, pkg.id, quote.amount, new Date().toISOString(), slip, quote.kind);
  // The chosen package is only stored on the payment. The company's package, features and subscription
  // dates change only when a superuser confirms the payment (or approves the account).

  // Notify the superuser and acknowledge the applicant. Emails are sent after the payment is saved.
  const company = req.session.tenant_name || '-';
  const applicant = req.session.email;
  const pkgRow = master.prepare('SELECT code, name FROM packages WHERE id = ?').get(pkg.id);
  const pkgLabel = pkgRow ? `${pkgRow.code} – ${pkgRow.name}` : pkg.id;
  const amountText = `${quote.amount.toLocaleString('th-TH')} บาท`;
  const kindText = quote.kind === 'upgrade' ? ` (อัพเกรดจาก ${quote.from.code}, ชำระส่วนต่าง)` : '';
  logEvent('payment_submit', { actor: applicant, target: applicant, tenantName: company, detail: `แพ็กเกจ ${pkgLabel}${kindText}, ${amountText}` });
  const superuserEmail = getSetting('superuser_email');
  await Promise.all([
    sendMail(
      superuserEmail,
      `[CFO Carbon] มีสมาชิกใหม่รอการอนุมัติ: ${company}`,
      [
        'มีสมาชิกใหม่ส่งหลักฐานการชำระค่าสมาชิกและรออนุมัติ',
        '',
        `บริษัท: ${company}`,
        `ผู้ติดต่อ: ${req.session.name || '-'}`,
        `อีเมล: ${applicant}`,
        `แพ็กเกจ: ${pkgLabel}`,
        `จำนวนเงิน: ${amountText}`,
        '',
        'กรุณาเข้าสู่ระบบ CFO Carbon ที่หน้า Admin เพื่อตรวจสอบสลิปและอนุมัติ',
      ].join('\n'),
    ),
    sendMail(
      applicant,
      'CFO Carbon: ได้รับใบสมัครและสลิปการชำระเงินของคุณแล้ว',
      [
        `เรียน ${req.session.name || 'ผู้สมัคร'}`,
        '',
        `ขอบคุณที่สมัครใช้งาน CFO Carbon สำหรับบริษัท ${company}`,
        `เราได้รับสลิปการชำระค่าสมาชิกแพ็กเกจ ${pkgLabel} (${amountText}) เรียบร้อยแล้ว`,
        '',
        'ทีมงานกำลังตรวจสอบการชำระเงิน กรุณารอการอนุมัติบัญชี เมื่ออนุมัติแล้วจะมีอีเมลแจ้งให้ทราบ',
        'ขอบคุณที่รอคอยค่ะ/ครับ',
        '',
        'CFO Carbon',
      ].join('\n'),
    ),
  ]);
  res.status(201).json({ ok: true });
});

// Superuser: send a test email to verify the SMTP settings. Uses the address in the request body
// if given (the value currently typed in the admin form), otherwise the saved superuser email.
app.post('/api/admin/test-email', requireAuth, requireSuperuser, async (req, res) => {
  const typed = String(req.body?.to || '').trim().toLowerCase();
  const to = typed || getSetting('superuser_email');
  if (!to) return res.status(400).json({ error: 'กรุณากรอกอีเมลผู้ดูแลระบบก่อนส่งทดสอบ' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'อีเมลไม่ถูกต้อง' });
  try {
    await deliverMail(
      to,
      '[CFO Carbon] ทดสอบการส่งอีเมล',
      `นี่คืออีเมลทดสอบจากระบบ CFO Carbon ส่งเมื่อ ${new Date().toLocaleString('th-TH')}\n\nหากคุณได้รับอีเมลนี้ แสดงว่าการตั้งค่า SMTP ทำงานได้แล้ว`,
    );
    res.json({ ok: true, to });
  } catch (err) {
    res.status(502).json({ error: `ส่งอีเมลไม่สำเร็จ: ${err.message}` });
  }
});

// Superuser: payments waiting for confirmation (with the customer's slip).
app.get('/api/admin/payments', requireAuth, requireSuperuser, (req, res) => {
  res.json(master.prepare(`SELECT p.id, p.amount, p.package_id, p.created_at, p.slip, t.name AS tenant_name
    FROM payments p JOIN tenants t ON t.id = p.tenant_id
    WHERE p.status = 'pending' ORDER BY p.created_at`).all());
});

// Superuser: confirm a payment -> activate the package, extend the subscription by one month
// and approve the company's accounts so they can use the system.
app.post('/api/admin/payments/:id/confirm', requireAuth, requireSuperuser, (req, res) => {
  const payment = master.prepare("SELECT * FROM payments WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'ไม่พบรายการที่รอยืนยัน' });
  const tenant = master.prepare('SELECT name, paid_until FROM tenants WHERE id = ?').get(payment.tenant_id);
  const now = Date.now();
  // Upgrade: the new package starts a fresh 12-month term from today.
  // Otherwise the term is added to the current end date (or starts today if it has ended).
  const base = payment.kind !== 'upgrade' && tenant?.paid_until && Date.parse(tenant.paid_until) > now
    ? tenant.paid_until
    : new Date(now).toISOString();
  const paidUntil = addMonths(base, PAID_MONTHS);
  master.transaction(() => {
    master.prepare("UPDATE payments SET status = 'confirmed', confirmed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), payment.id);
    master.prepare('UPDATE tenants SET paid_until = ?, package_id = ? WHERE id = ?')
      .run(paidUntil, payment.package_id, payment.tenant_id);
    master.prepare('UPDATE users SET approved = 1 WHERE tenant_id = ?').run(payment.tenant_id);
  })();

  // Tell the customer the account is approved, how to log in, and when the package expires.
  const pkgRow = master.prepare('SELECT code, name FROM packages WHERE id = ?').get(payment.package_id);
  const pkgLabel = pkgRow ? `${pkgRow.code} – ${pkgRow.name}` : payment.package_id;
  const expiryText = new Date(paidUntil).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const companyName = tenant?.name || '-';
  logEvent('payment_confirm', { actor: req.session.email, tenantName: companyName, detail: `แพ็กเกจ ${pkgLabel}, ${Number(payment.amount).toLocaleString('th-TH')} บาท, ใช้ได้ถึง ${expiryText}` });
  const users = master.prepare('SELECT email, name, role FROM users WHERE tenant_id = ?').all(payment.tenant_id);
  for (const u of users) {
    sendMail(
      u.email,
      'CFO Carbon: บัญชีของคุณได้รับการอนุมัติแล้ว',
      [
        `เรียน ${u.name || 'ผู้ใช้งาน'}`,
        '',
        `ขอบคุณที่เลือกสมัครใช้งาน CFO Carbon สำหรับบริษัท ${companyName}`,
        `การชำระเงินของคุณได้รับการยืนยันแล้ว และบัญชีได้รับการอนุมัติเรียบร้อย`,
        '',
        `แพ็กเกจ: ${pkgLabel}`,
        `วันหมดอายุ: ${expiryText}`,
        '',
        `คุณสามารถเข้าสู่ระบบด้วยอีเมล ${u.email} และรหัสผ่านที่ตั้งไว้ได้ทันที`,
        ...(isTenantAdmin(u.role)
          ? ['คุณเป็นผู้ดูแลบริษัท (Tenant Admin) สามารถเพิ่มผู้ใช้งานในบริษัทและกำหนดสิทธิ์การใช้งานของแต่ละคนได้ (จำนวนผู้ใช้งานขึ้นอยู่กับแพ็กเกจ)']
          : []),
        '',
        'ขอบคุณที่ไว้วางใจใช้บริการค่ะ/ครับ',
        '',
        'CFO Carbon',
      ].join('\n'),
    );
  }
  res.json({ ok: true, paidUntil });
});

// Superuser: reject a payment report (e.g. the transfer was not found).
app.post('/api/admin/payments/:id/reject', requireAuth, requireSuperuser, (req, res) => {
  const result = master.prepare("UPDATE payments SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'ไม่พบรายการที่รอยืนยัน' });
  const rejected = master.prepare(`SELECT p.amount, t.name AS tenant_name, u.email FROM payments p
    LEFT JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN users u ON u.tenant_id = p.tenant_id AND u.role = 'tenant_admin'
    WHERE p.id = ?`).get(req.params.id);
  logEvent('payment_reject', { actor: req.session.email, target: rejected?.email ?? null, tenantName: rejected?.tenant_name ?? null, detail: `${Number(rejected?.amount || 0).toLocaleString('th-TH')} บาท` });
  res.json({ ok: true });
});

// AI assistant: forwards the user's message to the webhook configured by the superuser.
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const packageFeatures = JSON.parse(req.session.package_features || '[]');
  if (!packageFeatures.includes('ai')) {
    return res.status(403).json({ error: 'ฟีเจอร์ AI Assistant ไม่รวมอยู่ในแพ็กเกจของคุณ' });
  }
  const url = getSetting('ai_webhook_url');
  if (!url) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า AI webhook ในหน้าผู้ดูแลระบบ' });
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId: String(req.body?.sessionId || req.token || 'default').slice(0, 100),
        history: req.body?.history || [],
        user: req.session.name || '',
      }),
      // n8n agent + vector search + LLM can take a while; override with AI_WEBHOOK_TIMEOUT_MS.
      signal: AbortSignal.timeout(Number(process.env.AI_WEBHOOK_TIMEOUT_MS) || 180000),
    });
    const text = await upstream.text();
    let reply = text;
    try {
      const data = JSON.parse(text);
      reply = data.reply ?? data.output ?? data.message ?? data.text ?? text;
    } catch { /* plain-text response */ }
    if (!upstream.ok) return res.status(502).json({ error: 'webhook ตอบกลับด้วยสถานะ ' + upstream.status });
    res.json({ reply: typeof reply === 'string' ? reply : JSON.stringify(reply) });
  } catch (err) {
    res.status(502).json({ error: 'เรียก webhook ไม่สำเร็จ: ' + (err.message || err) });
  }
});

// Net Zero Pathway advice: the client sends a summary of the plan (targets, gaps, initiatives, alerts).
// It goes to the same AI webhook (n8n) as the assistant, which already holds the LLM API key.
const NET_ZERO_ADVICE_PROMPT = [
  'คุณคือที่ปรึกษาด้านการลดก๊าซเรือนกระจกและ Net Zero ของบริษัท',
  'จากข้อมูลแผน Net Zero Pathway ใน context (หน่วย tCO2e, ค่าที่เป็นเปอร์เซ็นต์และงบประมาณระบุไว้ในชื่อฟิลด์) ให้:',
  '1) สรุปสถานะเทียบเป้าหมายระยะกลางและเป้าหมาย Net Zero แยกตาม Scope 1, 2, 3 และระบุ Scope ที่มีช่องว่างการลดมากที่สุด',
  '2) ชี้โครงการที่ล่าช้า ไม่อัปเดต ขาดตัวชี้วัด หรือมีความเสี่ยง พร้อมเหตุผล',
  '3) เสนอมาตรการเพิ่มเติมที่เหมาะสมกับช่องว่าง โดยระบุหมวดการปล่อย ปริมาณลดโดยประมาณ (tCO2e/ปี) ปีที่เริ่มให้ผล งบประมาณโดยประมาณ และ KPI',
  '4) ระบุข้อสมมติที่ใช้และสิ่งที่บริษัทต้องยืนยันเพิ่ม ตัวเลขที่เสนอเป็นค่าประมาณเบื้องต้นเท่านั้น',
  'ตอบเป็นภาษาไทย จัดเป็นหัวข้อสั้น กระชับ และอ่านง่าย',
].join('\n');

app.post('/api/net-zero/advice', requireAuth, async (req, res) => {
  const packageFeatures = JSON.parse(req.session.package_features || '[]');
  if (!packageFeatures.includes('ai')) {
    return res.status(403).json({ error: 'ฟีเจอร์ AI Assistant ไม่รวมอยู่ในแพ็กเกจของคุณ' });
  }
  const url = getSetting('ai_webhook_url');
  if (!url) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า AI webhook ในหน้าผู้ดูแลระบบ' });
  const context = req.body?.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return res.status(400).json({ error: 'ไม่มีข้อมูลแผนสำหรับวิเคราะห์' });
  }
  if (JSON.stringify(context).length > 60000) {
    return res.status(413).json({ error: 'ข้อมูลแผนมีขนาดใหญ่เกินไป' });
  }
  // ยกเลิกคำขอไปยัง AI ทันทีเมื่อผู้ใช้กดหยุดหรือปิดหน้า (และยังมี timeout เดิม)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Number(process.env.AI_WEBHOOK_TIMEOUT_MS) || 180000);
  timer.unref?.();
  res.on('close', () => {
    if (!res.writableFinished) ac.abort();
  });
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'net_zero_advice',
        // Put the plan data inside `message` so the existing n8n workflow (which reads `message`) sees it.
        message: `${NET_ZERO_ADVICE_PROMPT}\n\nข้อมูลแผน (JSON):\n${JSON.stringify(context)}`,
        context,
        sessionId: 'net-zero-' + req.session.user_id,
        history: [],
        user: req.session.name || '',
      }),
      signal: ac.signal,
    });
    const text = await upstream.text();
    clearTimeout(timer);
    if (!upstream.ok) return res.status(502).json({ error: 'webhook ตอบกลับด้วยสถานะ ' + upstream.status });
    let reply = text;
    try {
      const data = JSON.parse(text);
      reply = data.reply ?? data.output ?? data.message ?? data.text ?? text;
    } catch { /* plain-text response */ }
    res.json({ reply: typeof reply === 'string' ? reply : JSON.stringify(reply) });
  } catch (err) {
    res.status(502).json({ error: 'เรียก webhook ไม่สำเร็จ: ' + (err.message || err) });
  }
});

app.get('/api/data', requireAuth, requirePermission('activities', 'read'), (req, res) => {
  const company = req.db.prepare('SELECT data FROM company_profile WHERE id=1').get();
  const activities = req.db.prepare('SELECT data FROM activities ORDER BY updated_at, id').all().map(r => JSON.parse(r.data));
  res.json({ company: company ? JSON.parse(company.data) : null, activities });
});

app.put('/api/data', requireAuth, (req, res) => {
  const { company, activities = [] } = req.body;

  // Work out what this save changes, then check the matching permission before writing anything.
  const existing = req.db.prepare('SELECT id, data FROM activities').all();
  const before = new Map(existing.map(r => [r.id, canonicalJson(JSON.parse(r.data))]));
  const incomingIds = new Set();
  let creates = 0;
  let updates = 0;
  for (const a of activities) {
    incomingIds.add(a.id);
    if (!before.has(a.id)) creates++;
    else if (before.get(a.id) !== canonicalJson(a)) updates++;
  }
  const deletes = [...before.keys()].filter(id => !incomingIds.has(id)).length;
  const companyRow = req.db.prepare('SELECT data FROM company_profile WHERE id=1').get();
  const companyChanged = !!company
    && (!companyRow || canonicalJson(JSON.parse(companyRow.data)) !== canonicalJson(company));
  if (creates && !can(req.session, 'activities', 'create')) return res.status(403).json({ error: PERMISSION_DENIED });
  if (updates && !can(req.session, 'activities', 'update')) return res.status(403).json({ error: PERMISSION_DENIED });
  if (deletes && !can(req.session, 'activities', 'delete')) return res.status(403).json({ error: PERMISSION_DENIED });
  if (companyChanged && !can(req.session, 'company', 'update')) return res.status(403).json({ error: PERMISSION_DENIED });

  const save = req.db.transaction(() => {
    if (company) req.db.prepare(`INSERT INTO company_profile (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(JSON.stringify(company));
    req.db.prepare('DELETE FROM activities').run();
    const insert = req.db.prepare('INSERT INTO activities (id,data,updated_at) VALUES (?,?,?)');
    const now = new Date().toISOString();
    for (const activity of activities) insert.run(activity.id, JSON.stringify(activity), now);
  });
  save();
  res.json({ ok: true });
});

// Tenant-scoped key/value settings (EF overrides, GWP, Scope 3 tables, uncertainty scores).
// Stored in the logged-in tenant's own database, never in the browser.
app.get('/api/kv', requireAuth, (req, res) => {
  const out = {};
  for (const row of req.db.prepare('SELECT key, value FROM tenant_kv').all()) out[row.key] = row.value;
  res.json(out);
});

app.put('/api/kv/:key', requireAuth, requirePermission('settings', 'update'), (req, res) => {
  const key = req.params.key;
  const value = req.body?.value;
  if (!KV_KEY_RE.test(key)) return res.status(400).json({ error: 'key ไม่ถูกต้อง' });
  if (typeof value !== 'string') return res.status(400).json({ error: 'value ต้องเป็นข้อความ' });
  req.db.prepare(`INSERT INTO tenant_kv (key, value, updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, value, new Date().toISOString());
  res.json({ ok: true });
});

app.delete('/api/kv/:key', requireAuth, requirePermission('settings', 'delete'), (req, res) => {
  const key = req.params.key;
  if (!KV_KEY_RE.test(key)) return res.status(400).json({ error: 'key ไม่ถูกต้อง' });
  req.db.prepare('DELETE FROM tenant_kv WHERE key = ?').run(key);
  res.json({ ok: true });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

if (require.main === module) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log('CFO API listening on http://localhost:' + port));
}

module.exports = { app, master, getTenantDb, hashPassword, tenantDir, promptpayPayload };
