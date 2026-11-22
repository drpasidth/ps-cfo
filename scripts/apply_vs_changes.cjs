// One-off: edit public/Verification Sheet 2568.xlsx (rebuilt from the backup each run)
//  1. Fr-01 G3 = "PS Evolution Ltd."
//  2. Organization chart image (from company_profile) anchored A7:M25 on Fr-03.1
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..');
const xlsxPath = path.join(root, 'public', 'Verification Sheet 2568.xlsx');
const backupPath = xlsxPath.replace(/\.xlsx$/, '.backup.xlsx');

const db = new Database(path.join(root, 'data', 'cfo.sqlite3'), { readonly: true });
const row = db.prepare('SELECT data FROM company_profile WHERE id=1').get();
const company = JSON.parse(row.data);
const m = company.organizationChart && company.organizationChart.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
if (!m) throw new Error('organizationChart image not found');
const mime = m[1];
const ext = mime === 'image/jpeg' ? 'jpeg' : mime.split('/')[1];
const imgBytes = Buffer.from(m[2], 'base64');

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(backupPath));

  // 1. Fr-01 (sheet1) G3
  let s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const g3Re = /<c r="G3"([^>]*?)(\/>|>[\s\S]*?<\/c>)/;
  const g3 = s1.match(g3Re);
  if (!g3) throw new Error('G3 not found');
  const sMatch = g3[1].match(/\ss="\d+"/);
  s1 = s1.replace(g3Re, `<c r="G3"${sMatch ? sMatch[0] : ''} t="inlineStr"><is><t>PS Evolution Ltd.</t></is></c>`);
  // Fr-01 I1 = Document Name, I2 = Version
  const xmlEsc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const setFr01 = (addr, value) => {
    const v = (value || '').trim();
    if (!v) return;
    const re = new RegExp(`<c r="${addr}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
    const cm = s1.match(re);
    if (!cm) throw new Error(`Fr-01 ${addr} not found`);
    const st = cm[1].match(/\ss="\d+"/);
    s1 = s1.replace(re, `<c r="${addr}"${st ? st[0] : ''} t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`);
  };
  setFr01('I1', company.documentName);
  setFr01('I2', company.documentVersion);
  zip.file('xl/worksheets/sheet1.xml', s1);

  // 1b. Company name into other sheets (sheet file -> cell)
  const nameTargets = [
    ['sheet2.xml', 'G3'], // Fr-02
    ['sheet3.xml', 'G3'], // Fr-03.1
    ['sheet4.xml', 'F3'], // Fr-03.2
    ['sheet5.xml', 'I3'], // Fr-04.1
    ['sheet6.xml', 'I3'], // Fr-04.2
    ['sheet7.xml', 'F3'], // Fr-05
  ];
  // Saved profile name is "PS Evolution Ltd.," (stray trailing comma) – use the name without it.
  const companyName = (company.companyName || company.companyNameThai || '').trim().replace(/,+$/, '');
  if (!companyName) throw new Error('company name is empty in ข้อมูลบริษัท');
  const esc = companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const [file, addr] of nameTargets) {
    const p = `xl/worksheets/${file}`;
    let sx = await zip.file(p).async('string');
    const re = new RegExp(`<c r="${addr}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
    const cm = sx.match(re);
    if (!cm) throw new Error(`${file} ${addr} not found`);
    const st = cm[1].match(/\ss="\d+"/);
    sx = sx.replace(re, `<c r="${addr}"${st ? st[0] : ''} t="inlineStr"><is><t>${esc}</t></is></c>`);
    zip.file(p, sx);
  }

  // 2. Fr-03.1 (sheet3) -> drawing3.xml
  const drawingPath = 'xl/drawings/drawing3.xml';
  const drawingRelsPath = 'xl/drawings/_rels/drawing3.xml.rels';
  let dx = await zip.file(drawingPath).async('string');
  if (!/<\/xdr:wsDr>/.test(dx)) throw new Error('unexpected drawing3 xml');

  let n = 1;
  while (zip.file(`xl/media/vs_orgchart${n}.${ext}`)) n++;
  const mediaName = `vs_orgchart${n}.${ext}`;
  zip.file(`xl/media/${mediaName}`, imgBytes);

  const relId = 'rIdOrgChart1';
  const drels = zip.file(drawingRelsPath)
    ? (await zip.file(drawingRelsPath).async('string')).replace('</Relationships>', `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`;
  zip.file(drawingRelsPath, drels);

  const ids = [...dx.matchAll(/cNvPr id="(\d+)"/g)].map(x => +x[1]);
  const newId = Math.max(1, ...ids) + 1;
  // from col 0 row 6 (A7) to col 13 row 25 (end of M25)
  const anchor = `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>6</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>13</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${newId}" name="Organization Chart"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  dx = dx.replace('</xdr:wsDr>', anchor + '</xdr:wsDr>');
  zip.file(drawingPath, dx);

  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) {
    ct = ct.replace('<Default ', `<Default Extension="${ext}" ContentType="${mime}"/><Default `);
  }
  zip.file('[Content_Types].xml', ct);

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(xlsxPath, out);
  console.log('OK: G3 set on Fr-01; chart', mediaName, 'anchored A7:M25 on Fr-03.1 (drawing3.xml)');
})().catch(e => { console.error(e); process.exit(1); });
