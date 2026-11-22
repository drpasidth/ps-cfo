const x = require('xlsx');
const w = x.readFile('public/Verification Sheet 2568.xlsx', {cellStyles:true, sheetStubs:true});
const s = w.Sheets['Fr-04.1'];
const cells = ['A6','B6','C6','D6','E6','A10','B10','C10','D10','A11','B11','Q10','Q11'];
cells.forEach(c => {
  const cell = s[c];
  console.log(c + ':', JSON.stringify(cell ? {t:cell.t, v:cell.v, s:cell.s} : null));
});
// check if styles roundtrip
const buf = x.write(w, {bookType:'xlsx', type:'buffer', cellStyles:true});
const w2 = x.read(buf, {type:'buffer', cellStyles:true, sheetStubs:true});
const s2 = w2.Sheets['Fr-04.1'];
console.log('\nAfter roundtrip:');
cells.forEach(c => {
  const cell = s2[c];
  console.log(c + ':', JSON.stringify(cell ? {t:cell.t, v:cell.v, s:cell.s} : null));
});
