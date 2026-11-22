// Set EF_ID for legacy LPG activities: stationary -> SC-03, mobile -> MB-03.
// Only rows whose factorId is "lpg" are changed. Copies each tenant DB to .bak first.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dir = path.join(__dirname, '..', 'data', 'tenants');
const MAP = { stationary: 'SC-03', mobile: 'MB-03' };

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sqlite3'))) {
  const file = path.join(dir, f);
  const probe = new Database(file, { readonly: true });
  const hasLpg = probe.prepare('SELECT data FROM activities').all().some((r) => JSON.parse(r.data).factorId === 'lpg');
  probe.close();
  if (!hasLpg) continue;

  fs.copyFileSync(file, file + '.bak');
  const db = new Database(file);
  const rows = db.prepare('SELECT id, data FROM activities').all();
  const update = db.prepare('UPDATE activities SET data = ?, updated_at = ? WHERE id = ?');
  let changed = 0;
  db.transaction(() => {
    for (const r of rows) {
      const d = JSON.parse(r.data);
      if (d.factorId !== 'lpg' || !MAP[d.subCategory]) continue;
      d.factorId = MAP[d.subCategory];
      update.run(JSON.stringify(d), new Date().toISOString(), r.id);
      changed++;
    }
  })();
  db.close();
  console.log(f, 'updated rows:', changed);
}
