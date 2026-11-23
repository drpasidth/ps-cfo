// Consistent snapshot of every live SQLite database under data/ (safe while the app is running).
// Output: %TEMP%/ps-cfo-data/<same relative path>.sqlite3, backups (*.bak) are skipped.
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..', 'data');
const out = path.join(os.tmpdir(), 'ps-cfo-data');
fs.rmSync(out, { recursive: true, force: true });

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!name.endsWith('.sqlite3')) continue; // skips -wal, -shm, .bak
    const rel = path.relative(root, full);
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const db = new Database(full, { readonly: true, fileMustExist: true });
    db.backup(dest).then(() => { db.close(); console.log('ok', rel); });
  }
}
walk(root);
