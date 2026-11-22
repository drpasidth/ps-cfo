// Create (or promote) a platform superuser.
// Usage: node scripts/create-superuser.cjs <email> <password> [name]
// Runs on the server machine only, so there is no public way to become a superuser.
const crypto = require('crypto');
const { master, hashPassword } = require('../server.cjs');

const [, , rawEmail, password, name = 'Superuser'] = process.argv;
const email = String(rawEmail || '').trim().toLowerCase();

if (!email || !password) {
  console.error('Usage: node scripts/create-superuser.cjs <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = master.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
if (existing) {
  master.prepare('UPDATE users SET is_superuser = 1, password_hash = ? WHERE id = ?')
    .run(hashPassword(password), existing.id);
  console.log(`Promoted existing user ${email} to superuser and reset password.`);
} else {
  const now = new Date().toISOString();
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  master.transaction(() => {
    master.prepare('INSERT INTO tenants (id, name, db_file, created_at) VALUES (?,?,?,?)')
      .run(tenantId, 'Platform Admin', `tenants/${tenantId}.sqlite3`, now);
    master.prepare(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_superuser, created_at)
      VALUES (?,?,?,?,?,?,1,?)`).run(userId, tenantId, email, name, hashPassword(password), 'owner', now);
  })();
  console.log(`Created superuser ${email}.`);
}
