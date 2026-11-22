// Discover the sheet file mapping (sheetId -> filename)
const JSZip = require('jszip');
const fs = require('fs');
const buf = fs.readFileSync('public/Verification Sheet 2568.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const wb = await zip.file('xl/workbook.xml').async('string');
  console.log('workbook sheets section:');
  const m = wb.match(/<sheets>([\s\S]*?)<\/sheets>/);
  if (m) console.log(m[1]);
  
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  console.log('\nworkbook rels:');
  console.log(rels);
  
  // Also check the C/D cells of rows 11-23 in sheet5 to see empty cell structure
  const s5 = await zip.file('xl/worksheets/sheet5.xml').async('string');
  const rows = [...s5.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  for (const r of rows) {
    const rn = parseInt(r[1]);
    if (rn === 11) {
      // show full row 11
      console.log('\nFull row 11:', r[2]);
    }
  }
  
  // show sharedStrings to find unit 'ลิตร','litre' etc if present
  const ss = await zip.file('xl/sharedStrings.xml').async('string');
  const sstEntries = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m,i)=>({i,v:m[1].replace(/<[^>]+>/g,'').trim()}));
  console.log('\nFirst 10 SST:', sstEntries.slice(0,10));
  console.log('SST count:', sstEntries.length);
});
