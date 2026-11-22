const JSZip = require('jszip');
const fs = require('fs');
const buf = fs.readFileSync('public/Verification Sheet 2568.xlsx');
JSZip.loadAsync(buf).then(async zip => {
  const s5 = await zip.file('xl/worksheets/sheet5.xml').async('string');
  // Find all row numbers in Fr-04.1
  const rows = [...s5.matchAll(/<row r="(\d+)"[^>]*>/g)];
  const rowNums = rows.map(m => parseInt(m[1]));
  console.log('All row numbers in Fr-04.1:', rowNums.join(', '));
  // Show row 31-46 content briefly
  for (const rn of [30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46]) {
    const re = new RegExp(`<row r="${rn}"[^>]*>([\\s\\S]*?)<\\/row>`);
    const m = re.exec(s5);
    if (m) {
      // Check if B column has content
      const bRe = /<c r="B" + rn + '"[^>]*>([\\s\\S]*?)<\\/c>/;
      const bMatch = bRe.exec(m[1]);
      const bVal = bMatch ? bMatch[1].replace(/<[^>]+>/g,'') : '(empty)';
      console.log(`Row ${rn}: B=${bVal.substring(0,40)}`);
    } else {
      console.log(`Row ${rn}: MISSING`);
    }
  }
});