const x = require('xlsx');
const w = x.readFile('public/Verification Sheet 2568.xlsx', {cellStyles:true, sheetStubs:true});
const sheets = ['Fr-01','Fr-02','Fr-03.1','Fr-03.2','Fr-04.1','Fr-04.2','Fr-05'];
for (const sn of sheets) {
  const s = w.Sheets[sn];
  if (!s) continue;
  const hits = [];
  for (const [addr, cell] of Object.entries(s)) {
    if (addr.startsWith('!')) continue;
    const v = String(cell.v || '');
    if (['ชื่อองค์กรที่ขอขึ้นทะเบียน','ผู้จัดทำ','จัดทำโดย'].some(k => v.includes(k))) {
      const dec = x.utils.decode_cell(addr);
      hits.push({addr, r:dec.r, c:dec.c, v:v.trim()});
    }
  }
  console.log(sn, JSON.stringify(hits));
}

// Also check Fr-04.1 data rows structure - look at XML level to understand shared strings
const JSZip = require('jszip');
const fs = require('fs');
const buf = fs.readFileSync('public/Verification Sheet 2568.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  // list all files
  const names = Object.keys(zip.files);
  console.log('\nZip entries:', names.filter(n => n.includes('sheet') || n.includes('shared')));
  
  // read sharedStrings
  const ss = await zip.file('xl/sharedStrings.xml').async('string');
  console.log('\nSharedStrings length:', ss.length);
  // find the index of a few known strings
  const strings = [...ss.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m,i) => ({i, v:m[1]}));
  const hits = strings.filter(s => ['ชื่อองค์กรที่ขอขึ้นทะเบียน','ผู้จัดทำ','จัดทำโดย'].some(k=>s.v.includes(k)));
  console.log('SST hits:', JSON.stringify(hits));
  
  // read Fr-04.1 sheet xml to find data rows
  const sheetXml = await zip.file('xl/worksheets/sheet5.xml').async('string');
  // find rows 10-24 (Scope1 data)
  const rowMatches = [...sheetXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)];
  for (const m of rowMatches) {
    const rn = parseInt(m[1]);
    if (rn >= 10 && rn <= 15) {
      console.log('\nRow', rn, m[2].substring(0,300));
    }
  }
});
