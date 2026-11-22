// Parses public/EF_Scope3_V1.csv (UTF-8 with BOM, quoted multi-line fields).
// Exported for generators/tests. Returns an array of records (arrays of strings), header first.
const fs = require("fs");
const path = require("path");

function parseCsv(text) {
  const s = text.replace(/^\uFEFF/, "");
  const out = [];
  let rec = [];
  let f = "";
  let q = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) {
      if (c === '"') {
        if (s[k + 1] === '"') { f += '"'; k++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\n") { rec.push(f); out.push(rec); rec = []; f = ""; }
    else if (c === "\r") { /* skip */ }
    else f += c;
  }
  if (f.length || rec.length) { rec.push(f); out.push(rec); }
  return out;
}

function readScope3Csv() {
  const file = path.join(__dirname, "..", "public", "EF_Scope3_V1.csv");
  return parseCsv(fs.readFileSync(file, "utf8"));
}

module.exports = { parseCsv, readScope3Csv };

if (require.main === module) {
  const rows = readScope3Csv();
  console.log("records", rows.length, "header", rows[0]);
  const bad = rows.slice(1).filter((r) => r.length !== 7);
  console.log("bad length", bad.length);
  const kw = /เครื่องบิน|รถโดยสาร|กระดาษ|ฝังกลบ|ไฟฟ้า|น้ำประปา|รถ|น้ำมัน|ขนส่ง|เรือ|ของเสีย|Electricity/;
  const hits = rows.slice(1).filter((r) => kw.test(r[1]));
  console.log("keyword hits", hits.length);
  hits.slice(0, 25).forEach((r) => console.log(r[0], "|", r[1].slice(0, 70).replace(/\n/g, " "), "|", r[3], "|", r[4]));
}
