const JSZip = require('jszip');
const fs = require('fs');
const buf = fs.readFileSync('public/Verification Sheet 2568.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  // Test: read shared strings and verify our target addresses exist
  const sst = await zip.file('xl/sharedStrings.xml').async('string');
  const sstVals = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m,i)=>({i,v:m[1].replace(/<[^>]+>/g,'')}));
  console.log('SST count:', sstVals.length);

  // Check Fr-04.1 sheet for rows 11-23
  const s5 = await zip.file('xl/worksheets/sheet5.xml').async('string');
  const row11 = s5.match(/<row r="11"[^>]*>([\s\S]*?)<\/row>/);
  if(row11) console.log('Row 11 exists');
  const row23 = s5.match(/<row r="23"[^>]*>([\s\S]*?)<\/row>/);
  if(row23) console.log('Row 23 exists');
  const row32 = s5.match(/<row r="32"[^>]*>([\s\S]*?)<\/row>/);
  if(row32) console.log('Row 32 (Scope 2 start) exists');
  const row37 = s5.match(/<row r="37"[^>]*>([\s\S]*?)<\/row>/);
  if(row37) console.log('Row 37 (Scope 3 start) exists');

  // Check target cells for Fr-01
  const s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  ['H3','F4','C6'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-01', addr, re.test(s1) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-02 targets
  const s2 = await zip.file('xl/worksheets/sheet2.xml').async('string');
  ['H3','G4'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-02', addr, re.test(s2) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-03.1 targets
  const s3 = await zip.file('xl/worksheets/sheet3.xml').async('string');
  ['H3','G4','B26'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-03.1', addr, re.test(s3) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-03.2 targets
  const s4 = await zip.file('xl/worksheets/sheet4.xml').async('string');
  ['G3','F4'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-03.2', addr, re.test(s4) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-04.1 targets
  ['J3','I4','B46'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-04.1', addr, re.test(s5) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-04.2 targets
  const s6 = await zip.file('xl/worksheets/sheet6.xml').async('string');
  ['J3','I4','B46'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-04.2', addr, re.test(s6) ? 'EXISTS' : 'MISSING');
  });
  
  // Fr-05 targets
  const s7 = await zip.file('xl/worksheets/sheet7.xml').async('string');
  ['G3','F4','B37'].forEach(addr=>{
    const re = new RegExp(`<c r="${addr}"[^>]*>`);
    console.log('Fr-05', addr, re.test(s7) ? 'EXISTS' : 'MISSING');
  });
});