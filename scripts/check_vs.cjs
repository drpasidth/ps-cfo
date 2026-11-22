const J = require('jszip');
const fs = require('fs');
J.loadAsync(fs.readFileSync('public/Verification Sheet 2568.xlsx')).then(async z => {
  const s = await z.file('xl/worksheets/sheet1.xml').async('string');
  console.log(/<drawing r:id="[^"]+"\/>/.exec(s)[0]);
  console.log(/<c r="G3"[\s\S]*?<\/c>/.exec(s)[0]);
  console.log(await z.file('xl/worksheets/_rels/sheet1.xml.rels').async('string'));
});
