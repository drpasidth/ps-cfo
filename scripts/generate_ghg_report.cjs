// Generates the organisation GHG report (TGO template TCFO_R_02 structure) as DOCX and PDF.
// Usage: node scripts/generate_ghg_report.cjs [tenantId] [year]
// Reads data/tenants/<tenantId>.sqlite3 (read-only). Output goes to reports/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const D = require('better-sqlite3');
const docx = require('docx');

const ROOT = path.join(__dirname, '..');
const TENANT = process.argv[2] || 'f98edd8c-9045-4e8b-a241-ef1d6bd691bf';
const YEAR = Number(process.argv[3] || 2026);
const BASE_YEAR = YEAR - 1;
const FONT = 'Leelawadee UI';

// ---------------------------------------------------------------- data
const db = new D(path.join(ROOT, 'data', 'tenants', TENANT + '.sqlite3'), { readonly: true });
const company = JSON.parse(db.prepare('SELECT data FROM company_profile WHERE id=1').get().data);
const activities = db.prepare('SELECT data FROM activities').all().map(r => JSON.parse(r.data));
db.close();

const current = activities.filter(a => a.period === 'current' && a.year === YEAR);
const base = activities.filter(a => a.period === 'base' && a.year === BASE_YEAR);

// Same rules as src/context/AppContext.tsx (roundUp2 / roundUpInt)
const roundUp2 = v => Math.ceil(v * 100) / 100;
const roundUpInt = v => Math.ceil(v);
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '-');
};
const sumCo2e = list => list.reduce((s, a) => s + (a.co2e || 0), 0);

const SUB_NAME = {
  stationary: 'การเผาไหม้อยู่กับที่ (Stationary Combustion)',
  mobile: 'การเผาไหม้เคลื่อนที่ (Mobile Combustion)',
  fugitive: 'การปล่อยจากการรั่วไหลและอื่น ๆ (Fugitive Emissions)',
  electricity: 'การใช้ไฟฟ้า',
  purchased_goods: 'การซื้อวัตถุดิบและบริการ (Purchased goods and services)',
};
const SUB_ORDER = Object.keys(SUB_NAME);
const SCOPE_LABEL = { scope1: 'Scope 1', scope2: 'Scope 2', scope3: 'Scope 3' };

const s1 = sumCo2e(current.filter(a => a.scope === 'scope1'));
const s2 = sumCo2e(current.filter(a => a.scope === 'scope2'));
const s3 = sumCo2e(current.filter(a => a.scope === 'scope3'));
const grandRaw = roundUp2(s1 + s2 + s3);
const grandRounded = roundUpInt(s1) + roundUpInt(s2) + roundUpInt(s3);

// Source-level significance (TGO: "มาก" when >= 5% of F+2, or F+2+3 for Scope 3)
const sourceLabel = a => (a.description ? `${a.description} (${a.factorId})` : a.factorId || '-');
const sources = new Map();
for (const a of current) {
  const key = [a.scope, a.subCategory, a.factorId, a.description || ''].join('|');
  const row = sources.get(key) || { scope: a.scope, sub: a.subCategory, label: sourceLabel(a), factorId: a.factorId, co2e: 0 };
  row.co2e += a.co2e || 0;
  sources.set(key, row);
}
const sourceList = [...sources.values()].sort((x, y) =>
  x.scope.localeCompare(y.scope) || SUB_ORDER.indexOf(x.sub) - SUB_ORDER.indexOf(y.sub) || y.co2e - x.co2e);
const f2Total = s1 + s2;
const f23Total = s1 + s2 + s3;
for (const r of sourceList) {
  const denom = r.scope === 'scope3' ? f23Total : f2Total;
  r.significance = denom > 0 ? (r.co2e / denom >= 0.05 ? 'มาก' : 'น้อย') : '-';
}
const sourcesOf = scope => sourceList.filter(r => r.scope === scope);

// ---------------------------------------------------------------- content model
// Blocks: title, h1, h2, p (muted optional), bullets, kv, table, sign, pagebreak
const B = [];
const title = t => B.push({ t: 'title', text: t });
const h1 = t => B.push({ t: 'h1', text: t });
const h2 = t => B.push({ t: 'h2', text: t });
const p = (text, muted = false) => B.push({ t: 'p', text, muted });
const bullets = items => B.push({ t: 'bullets', items });
const kv = rows => B.push({ t: 'kv', rows });
const table = (head, rows, align = []) => B.push({ t: 'table', head, rows, align });
const pagebreak = () => B.push({ t: 'pagebreak' });

const periodText = `${fmtDate(company.reportingPeriodFrom)} – ${fmtDate(company.reportingPeriodTo)}`;

title('รายงานการปล่อยและดูดกลับก๊าซเรือนกระจกขององค์กร');
kv([
  ['ชื่อองค์กร', `${company.companyName || '-'}${company.companyNameThai ? ` (${company.companyNameThai})` : ''}`],
  ['ที่อยู่/สถานที่ตั้งองค์กร', company.address || '-'],
  ['เลขประจำตัวผู้เสียภาษี', company.taxId || '-'],
  ['ระยะเวลาในการติดตามผล', periodText],
  ['วันที่รายงานผล', fmtDate(company.registrationDate)],
]);

h1('1. บทนำ');
bullets([
  'เพื่อสนับสนุนนโยบายสิ่งแวดล้อม อาชีวอนามัยและความปลอดภัยขององค์กร',
  'เพื่อสนับสนุนการติดตามและปรับปรุงประสิทธิภาพการใช้พลังงานและต้นทุนค่าใช้จ่ายภายในองค์กร',
  'เพื่อส่งเสริมภาพลักษณ์และการประชาสัมพันธ์องค์กรในการลดปริมาณการปล่อยก๊าซที่ก่อให้เกิดปรากฏการณ์เรือนกระจก',
]);

h1('2. ข้อมูลทั่วไป');
kv([
  ['2.1 ชื่อองค์กร', company.companyName || '-'],
  ['2.2 ที่อยู่/สถานที่ตั้งองค์กร', company.address || '-'],
  ['2.3 ประเภทของอุตสาหกรรม', company.industry || '-'],
  ['2.4 ชื่อผู้ประสานงาน', company.contactPerson || '-'],
  ['2.5 ชื่อผู้รับผิดชอบข้อมูล', company.preparedBy || '-'],
  ['2.6 ระยะเวลาติดตามผล', periodText],
  ['2.7 แนวทางที่ใช้ในการติดตามผล', 'ข้อกำหนดในการคำนวณและรายงานคาร์บอนฟุตพริ้นท์ขององค์กร (ฉบับปรับปรุงครั้งที่ 1, มกราคม 2564)'],
  ['2.8 ระดับของการรับรอง (Level of Assurance)', 'ยังไม่ระบุ (กำหนดโดยหน่วยทวนสอบ)'],
  ['2.9 ระดับความมีสาระสำคัญ (Materiality Threshold)', '5%'],
]);

h1('3. ขอบเขต');
h2('3.1 ขอบเขตขององค์กร');
kv([
  ['แนวทางกำหนดขอบเขตองค์กร', 'การควบคุมการดำเนินงาน (Operational Control)'],
  ['ขอบเขต Scope 1', company.scope1Boundary || '-'],
  ['ขอบเขต Scope 2', company.scope2Boundary || '-'],
  ['ขอบเขต Scope 3', company.scope3Boundary || '-'],
]);
if (company.scope3Boundary === 'ไม่มี' && sourcesOf('scope3').length) {
  p('หมายเหตุ: ข้อมูลองค์กรระบุขอบเขต Scope 3 เป็น "ไม่มี" แต่มีรายการ Scope 3 ในระบบ จึงรวมไว้ในรายงานนี้ กรุณายืนยันขอบเขต', true);
}
h2('3.2 ขอบเขตการดำเนินงาน');
bullets([
  'ก๊าซเรือนกระจกที่พิจารณา: CO2, CH4, N2O, HFCs, PFCs, SF6, NF3',
  'GWP: IPCC Fifth Assessment Report (AR5)',
]);
h2('3.2.1–3.2.4 แหล่งปล่อยก๊าซเรือนกระจกที่ระบุ');
table(
  ['ขอบเขต', 'ประเภทแหล่งปล่อย', 'แหล่งปล่อย (Emission Source)', 'ความสำคัญ'],
  sourceList.map(r => [SCOPE_LABEL[r.scope], SUB_NAME[r.sub] || r.sub, r.label, r.significance]),
);
p('ความสำคัญ "มาก" หมายถึงปริมาณการปล่อยตั้งแต่ร้อยละ 5 ของปริมาณการปล่อยทั้งหมดของ Scope 1+2 (สำหรับ Scope 3 ใช้ Scope 1+2+3); "น้อย" หมายถึงน้อยกว่าร้อยละ 5', true);

h1('4. การติดตามผล');
p('รายการกิจกรรมปีที่รายงาน (ข้อมูลกิจกรรม ค่า EF และที่มาของข้อมูลจากระบบ)');
table(
  ['เดือน', 'ขอบเขต', 'แหล่งปล่อย', 'Factor ID', 'ปริมาณกิจกรรม', 'หน่วย', 'CO2e (kg)'],
  [...current]
    .sort((x, y) => (x.scope.localeCompare(y.scope)) || ((x.month || '').localeCompare(y.month || '')))
    .map(a => [
      a.month || '-', SCOPE_LABEL[a.scope] || a.scope, a.description || SUB_NAME[a.subCategory] || '-',
      a.factorId || '-', fmt(a.activityData), a.unit || '-', fmt(a.co2e),
    ]),
  ['l', 'l', 'l', 'l', 'r', 'l', 'r'],
);

h1('5. สรุปปริมาณการปล่อยก๊าซเรือนกระจก');
h2('5.1 Scope 1');
table(
  ['แหล่งปล่อย', 'ประเภท', 'CO2e (kg) ทศนิยม 2 ตำแหน่ง'],
  [...sourcesOf('scope1').map(r => [r.label, SUB_NAME[r.sub] || r.sub, fmt(r.co2e)]),
    ['รวม Scope 1', `ปัดขึ้น (FR-05): ${fmt(roundUpInt(s1), 0)} kgCO2e`, fmt(s1)]],
  ['l', 'l', 'r'],
);
h2('5.2 Scope 2');
table(
  ['แหล่งปล่อย', 'ประเภท', 'CO2e (kg) ทศนิยม 2 ตำแหน่ง'],
  [...sourcesOf('scope2').map(r => [r.label, SUB_NAME[r.sub] || r.sub, fmt(r.co2e)]),
    ['รวม Scope 2', `ปัดขึ้น (FR-05): ${fmt(roundUpInt(s2), 0)} kgCO2e`, fmt(s2)]],
  ['l', 'l', 'r'],
);
h2('5.3 Scope 3');
if (sourcesOf('scope3').length) {
  table(
    ['แหล่งปล่อย', 'ประเภท', 'CO2e (kg) ทศนิยม 2 ตำแหน่ง'],
    [...sourcesOf('scope3').map(r => [r.label, SUB_NAME[r.sub] || r.sub, fmt(r.co2e)]),
      ['รวม Scope 3', `ปัดขึ้น (FR-05): ${fmt(roundUpInt(s3), 0)} kgCO2e`, fmt(s3)]],
    ['l', 'l', 'r'],
  );
} else {
  p('ไม่มีรายการ Scope 3 ในปีที่รายงาน');
}
h2('5.4 สรุปรวม');
table(
  ['ขอบเขต', 'kgCO2e (ทศนิยม 2 ตำแหน่ง)', 'kgCO2e (ปัดขึ้น FR-05)', 'tCO2e (ทศนิยม 2 ตำแหน่ง)'],
  [
    ['Scope 1', fmt(s1), fmt(roundUpInt(s1), 0), fmt(s1 / 1000)],
    ['Scope 2', fmt(s2), fmt(roundUpInt(s2), 0), fmt(s2 / 1000)],
    ['Scope 3', fmt(s3), fmt(roundUpInt(s3), 0), fmt(s3 / 1000)],
    ['รวม Scope 1 + 2 + 3', fmt(grandRaw), fmt(grandRounded, 0), fmt(grandRaw / 1000)],
  ],
  ['l', 'r', 'r', 'r'],
);
p(`รวมก๊าซเรือนกระจกทั้งหมด ${fmt(grandRounded, 0)} kgCO2e (เท่ากับ ${fmt(grandRaw / 1000)} tCO2e) โดยปัดขึ้นแต่ละขอบเขตก่อนรวม ตามมติที่ประชุม TGO ครั้งที่ 4/2563`);
h2('5.5 Carbon Intensity');
p('ยังไม่มีข้อมูลปริมาณผลผลิต จึงยังไม่คำนวณค่า Carbon Intensity');

h1('6. ปีฐาน');
const bs1 = sumCo2e(base.filter(a => a.scope === 'scope1'));
const bs2 = sumCo2e(base.filter(a => a.scope === 'scope2'));
const bs3 = sumCo2e(base.filter(a => a.scope === 'scope3'));
kv([
  ['6.1 ปีฐานที่ใช้อ้างอิง', `ปี ${BASE_YEAR} (พ.ศ. ${BASE_YEAR + 543})`],
]);
table(
  ['ขอบเขต', 'ปริมาณการปล่อยของปีฐาน (tCO2e)'],
  [
    ['ขอบเขตที่ 1', fmt(bs1 / 1000)],
    ['ขอบเขตที่ 2', fmt(bs2 / 1000)],
    ['ขอบเขตที่ 3', fmt(bs3 / 1000)],
    ['รวม', fmt((bs1 + bs2 + bs3) / 1000)],
  ],
  ['l', 'r'],
);

h1('7. ผู้จัดทำและการอนุมัติ');
B.push({
  t: 'sign',
  head: ['บทบาท', 'ชื่อ-นามสกุล', 'ลายเซ็น / วันที่'],
  rows: [
    ['จัดทำ', company.preparedBy || '-', ''],
    ['ตรวจทาน', company.reviewedBy || '-', ''],
    ['อนุมัติ', company.approvedBy || '-', ''],
  ],
});
p('รายงานนี้จัดทำจากข้อมูลในระบบ CFO-flow ตามโครงสร้างแบบฟอร์ม TCFO_R_02 (Version 03) ส่วนที่ยังไม่มีข้อมูล ได้แก่ ระดับการรับรอง บันทึกการสอบเทียบอุปกรณ์ ผลการประเมินความไม่แน่นอน และแผนผังการไหลของข้อมูล ต้องกรอกเพิ่มเติมก่อนส่งหน่วยทวนสอบ', true);

// ---------------------------------------------------------------- DOCX
const run = (text, o = {}) => new docx.TextRun({ text: String(text), font: FONT, bold: o.bold, size: o.size, color: o.color });
const dPara = (text, o = {}) => new docx.Paragraph({
  alignment: o.align, spacing: { after: 80 }, pageBreakBefore: o.pageBreakBefore,
  children: [run(text, o)],
});
const dCell = (text, o = {}) => new docx.TableCell({
  shading: o.header ? { fill: '166534', type: docx.ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: { top: 60, bottom: 60, left: 80, right: 80 },
  children: [new docx.Paragraph({
    alignment: o.right ? docx.AlignmentType.RIGHT : docx.AlignmentType.LEFT,
    children: [run(text, { size: 18, bold: o.bold || o.header, color: o.header ? 'FFFFFF' : undefined })],
  })],
});
const dTable = (head, rows, align = []) => new docx.Table({
  width: { size: 100, type: docx.WidthType.PERCENTAGE },
  rows: [
    new docx.TableRow({ tableHeader: true, children: head.map((h, i) => dCell(h, { header: true, right: align[i] === 'r' })) }),
    ...rows.map(r => new docx.TableRow({
      children: r.map((c, i) => dCell(c, { right: align[i] === 'r', bold: /^รวม|^ปัดขึ้น \(FR|^รวม Scope/.test(String(r[0])) })),
    })),
  ],
});
const dKv = rows => new docx.Table({
  width: { size: 100, type: docx.WidthType.PERCENTAGE },
  rows: rows.map(([k, v]) => new docx.TableRow({ children: [dCell(k, { bold: true }), dCell(v)] })),
});

const children = [];
for (const b of B) {
  switch (b.t) {
    case 'title':
      children.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 240 },
        children: [run(b.text, { bold: true, size: 30, color: '166534' })] }));
      break;
    case 'h1':
      children.push(new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 },
        children: [run(b.text, { bold: true, size: 24, color: '166534' })] }));
      break;
    case 'h2':
      children.push(new docx.Paragraph({ spacing: { before: 160, after: 80 }, children: [run(b.text, { bold: true, size: 21 })] }));
      break;
    case 'p':
      children.push(dPara(b.text, { color: b.muted ? '6B7280' : undefined, size: b.muted ? 17 : undefined }));
      break;
    case 'bullets':
      for (const it of b.items) children.push(dPara('• ' + it));
      break;
    case 'kv':
      children.push(dKv(b.rows));
      break;
    case 'table':
      children.push(dTable(b.head, b.rows, b.align));
      break;
    case 'sign':
      children.push(new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: [
          new docx.TableRow({ tableHeader: true, children: b.head.map(h => dCell(h, { header: true })) }),
          ...b.rows.map(r => new docx.TableRow({ height: { value: 600, rule: docx.HeightRule.ATLEAST },
            children: [dCell(r[0]), dCell(r[1]), dCell('................................................')] })),
        ],
      }));
      break;
    case 'pagebreak':
      children.push(dPara('', { pageBreakBefore: true }));
      break;
  }
}

const doc = new docx.Document({
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    children,
  }],
});

// ---------------------------------------------------------------- HTML -> PDF
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let body = '';
let inKv = false;
for (const b of B) {
  switch (b.t) {
    case 'title': body += `<h1 class="title">${esc(b.text)}</h1>`; break;
    case 'h1': body += `<h2 class="sec">${esc(b.text)}</h2>`; break;
    case 'h2': body += `<h3>${esc(b.text)}</h3>`; break;
    case 'p': body += `<p class="${b.muted ? 'muted' : ''}">${esc(b.text)}</p>`; break;
    case 'bullets': body += '<ul>' + b.items.map(i => `<li>${esc(i)}</li>`).join('') + '</ul>'; break;
    case 'kv':
      body += '<table class="kv">' + b.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</table>';
      break;
    case 'table': {
      const cls = i => (b.align[i] === 'r' ? ' class="r"' : '');
      body += '<table><thead><tr>' + b.head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('') + '</tr></thead><tbody>'
        + b.rows.map(r => `<tr class="${/^รวม|^ปัดขึ้น \(FR/.test(String(r[0])) ? 'total' : ''}">` + r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>';
      break;
    }
    case 'sign':
      body += '<table><thead><tr>' + b.head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>'
        + b.rows.map(r => `<tr class="sign"><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td></td></tr>`).join('') + '</tbody></table>';
      break;
    case 'pagebreak': body += '<div class="pb"></div>'; break;
  }
}
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'Leelawadee UI', Tahoma, sans-serif; font-size: 11pt; color: #111; }
h1.title { text-align: center; color: #166534; font-size: 20pt; margin: 0 0 14px; }
h2.sec { color: #166534; font-size: 14pt; margin: 18px 0 6px; border-bottom: 1px solid #bbf7d0; padding-bottom: 3px; }
h3 { font-size: 11.5pt; margin: 12px 0 4px; }
p { margin: 4px 0; line-height: 1.5; }
p.muted { color: #6b7280; font-size: 9pt; }
ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #9ca3af; padding: 4px 6px; text-align: left; vertical-align: top; }
thead th { background: #166534; color: #fff; }
td.r, th.r { text-align: right; }
tr.total td { font-weight: bold; background: #ecfdf5; }
table.kv th { width: 36%; background: #f3f4f6; color: #111; font-weight: bold; }
table.kv td { font-size: 10pt; }
tr.sign td { height: 26px; }
.pb { page-break-before: always; }
</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------- write files
const outDir = path.join(ROOT, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const slug = (company.companyName || 'company').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'company';
const base_name = `GHG_Report_${slug}_${YEAR}`;
const docxPath = path.join(outDir, base_name + '.docx');
const pdfPath = path.join(outDir, base_name + '.pdf');

(async () => {
  fs.writeFileSync(docxPath, await docx.Packer.toBuffer(doc));
  console.log('DOCX written:', docxPath);

  const htmlPath = path.join(os.tmpdir(), base_name + '.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const browser = candidates.find(c => fs.existsSync(c));
  if (!browser) throw new Error('ไม่พบ Microsoft Edge หรือ Chrome สำหรับสร้าง PDF');
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  execFileSync(browser, [
    '--headless', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore', timeout: 120000 });
  fs.unlinkSync(htmlPath);
  if (!fs.existsSync(pdfPath)) throw new Error('สร้าง PDF ไม่สำเร็จ');
  console.log('PDF written:', pdfPath);
  console.log(`Totals (kg): S1 ${fmt(s1)} | S2 ${fmt(s2)} | S3 ${fmt(s3)} | grand rounded ${fmt(grandRounded, 0)}`);
})().catch(e => { console.error(e); process.exit(1); });
