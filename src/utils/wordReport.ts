// Word (.docx) GHG report that follows the TGO form TCFO_R_02 (Report TGO Workshop.pdf) layout and table headers.
// Sections: cover, 1 บทนำ, 2 ข้อมูลทั่วไป, 3 ขอบเขต, 4 การติดตามผล, 5 สรุปปริมาณการปล่อย, 6 ปีฐาน,
// 7 การจัดการคุณภาพของข้อมูล (from the company profile), 8 ความไม่แน่นอน, ภาคผนวก (หลักเกณฑ์คัดเลือกขอบเขตที่ 3).
import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ActivityRecord, CompanyProfile, SubCategory } from "../types";
import { periodOf } from "../types";
import { calculateTotals, formatInt, formatNumber, kgToTonnes } from "./calculations";
import { buildScope3Rows } from "./scope3Significance";
import { SCOPE_LABEL, UNCERTAINTY_LEVELS, buildUncertaintyItems, getUncertaintyScores, type UncertaintyLevel } from "../data/uncertainty";

interface ReportInput {
  company: CompanyProfile;
  activities: ActivityRecord[]; // already filtered to the package's scopes
  includeScope3: boolean;
  factors?: { id: string; name: string }[]; // emission factor list, used for factor names in section 8
}

// Scope 3 selection criteria (Fr-03.2 of the Verification Sheet)
const SCOPE3_CRITERIA: [string, string][] = [
  ["Source of GHG", "องค์กรมีแหล่งปล่อยก๊าซเรือนกระจกนี้หรือไม่"],
  ["ขนาด (Magnitude or Size)", "เป็นกิจกรรมการปล่อยหรือดูดกลับก๊าซเรือนกระจกทางอ้อมซึ่งถูกสันนิษฐานว่ามีปริมาณการปล่อยหรือดูดกลับก๊าซเรือนกระจกในปริมาณมากอย่างมีนัยสำคัญ"],
  ["ระดับของแรงจูงใจ (Level of influence (Reduction of potential))", "เป็นกิจกรรมการปล่อยหรือดูดกลับก๊าซเรือนกระจกที่องค์กรมีความสามารถในการตรวจติดตามและลดปริมาณการปล่อยหรือดูดกลับก๊าซเรือนกระจกจากกิจกรรมนั้น (ตัวอย่างเช่นเป็นกิจกรรมที่เกี่ยวข้องกับการประเมินประสิทธิภาพพลังงาน การออกแบบเชิงนิเวศเศรษฐกิจ, เกี่ยวข้องกับข้อตกลงที่มีกับลูกค้า, เกี่ยวข้องกับข้อกำหนดขอบเขตงานจากผู้ว่าจ้าง)"],
  ["ความเสี่ยง หรือ โอกาส (Risk or opportunity)", "เป็นกิจกรรมการปล่อยหรือดูดกลับก๊าซเรือนกระจกทางอ้อมซึ่งมีส่วนทำให้องค์กรได้รับความเสี่ยง (เช่น ความเสี่ยงทางด้านการเงิน, กฎระเบียบข้อบังคับ, ห่วงโซ่อุปทาน, สินค้าและลูกค้า, การดำเนินคดี และชื่อเสียง) หรือได้รับโอกาสทางธุรกิจ (เช่น การเข้าสู่ช่องทางตลาดใหม่ หรือระบบธุรกิจรูปแบบใหม่)"],
  ["Sector Guidance", "เป็นกิจกรรมการปล่อยก๊าซเรือนกระจกที่ถูกถือว่ามีนัยสำคัญสำหรับอุตสาหกรรมที่กำลังพิจารณา ตามที่กำหนดไว้ในคู่มือหรือแนวทางที่เฉพาะเจาะจงสำหรับอุตสาหกรรมนั้น"],
  ["Outsourcing", "เป็นกิจกรรมการปล่อยและดูดกลับก๊าซเรือนกระจกทางอ้อมที่เกิดจากการจัดจ้างบุคคลหรือหน่วยงานภายนอกเข้ามาดำเนินกิจกรรมที่ถือว่าเป็นกิจกรรมหลักในการดำเนินธุรกิจขององค์กร"],
  ["Employee engagement", "เป็นกิจกรรมการปล่อยก๊าซเรือนกระจกทางอ้อมที่สามารถส่งเสริมให้พนักงานมีส่วนร่วมในการลดการปล่อยก๊าซเรือนกระจก ผ่านการลดการใช้พลังงาน หรือการทำงานร่วมกันเป็นทีมภายใต้หลักคิดเรื่องการเปลี่ยนแปลงสภาพภูมิอากาศ (เช่น การสร้างแรงจูงใจในการอนุรักษ์พลังงาน, การใช้รถร่วมกัน, การประเมินราคาคาร์บอนภายในองค์กร)"],
];

const FONT = "TH SarabunPSK"; // body font, 16 pt
const HEAD_FONT = "Tahoma"; // header font (running header, table headers, section headings)
const BODY_PT = 32; // docx sizes are half-points: 32 = 16 pt
const GREEN = "166534";
const GREY = "6B7280";

const SCOPE1_GROUPS: [SubCategory, string][] = [
  ["stationary", "การปล่อยก๊าซเรือนกระจกที่เกิดขึ้นจากการเผาไหม้อยู่กับที่ (Stationary Combustion)"],
  ["mobile", "การปล่อยก๊าซเรือนกระจกที่เกิดขึ้นจากการเผาไหม้แบบเคลื่อนที่ (Mobile Combustion)"],
  ["fugitive", "การปล่อยก๊าซเรือนกระจกที่เกิดขึ้นจากการรั่วไหลและอื่น ๆ (Fugitive Emissions)"],
];

const SCOPE3_LABEL: Partial<Record<SubCategory, string>> = {
  purchased_goods: "Category 1 Purchased goods and services (การซื้อวัตถุดิบและบริการ)",
  capital_goods: "Category 2 Capital goods",
  fuel_energy: "Category 3 Fuel- and energy-related activities",
  upstream_transport: "Category 4 Upstream transportation and distribution",
  waste: "Category 5 Waste generated in operations",
  business_travel: "Category 6 Business travel",
  commuting: "Category 7 Employee commuting",
  upstream_leased: "Category 8 Upstream leased assets",
  downstream_transport: "Category 9 Downstream transportation and distribution",
  processing_sold: "Category 10 Processing of sold products",
  use_sold: "Category 11 Use of sold products",
  end_of_life: "Category 12 End-of-life treatment of sold products",
  downstream_leased: "Category 13 Downstream leased assets",
  franchises: "Category 14 Franchises",
  investments: "Category 15 Investments",
};

const GAS_COLUMNS = ["CO2", "CH4", "N2O", "SF6", "NF3", "HFCs", "PFCs"];

// Embed a picture (any browser-readable image) as PNG, scaled to at most 16 cm wide.
async function imageParagraph(dataUrl: string): Promise<Paragraph | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const b64 = canvas.toDataURL("image/png").split(",")[1];
  const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const maxWidth = 600; // pixels at 96 dpi (~16 cm)
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new ImageRun({
        type: "png",
        data,
        transformation: { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) },
      }),
    ],
  });
}

// Body text is always 16 pt. Headers (opts.header) keep their own size and font.
function text(value: string, opts: { bold?: boolean; size?: number; color?: string; header?: boolean } = {}) {
  return new TextRun({
    text: value,
    font: opts.header ? HEAD_FONT : FONT,
    bold: opts.bold,
    size: opts.header ? opts.size : BODY_PT,
    color: opts.color,
  });
}

function para(
  value: string,
  opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) {
  return new Paragraph({ alignment: opts.align, spacing: { after: 80 }, children: [text(value, opts)] });
}

function heading(value: string, pageBreak = false) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore: pageBreak,
    spacing: { before: 240, after: 120 },
    children: [text(value, { bold: true, size: 24, color: GREEN, header: true })],
  });
}

// Cell content: one string or several lines (one paragraph each).
function cell(
  value: string | string[],
  opts: { bold?: boolean; header?: boolean; right?: boolean; columnSpan?: number; rowSpan?: number } = {},
) {
  const lines = Array.isArray(value) ? value : [value];
  return new TableCell({
    columnSpan: opts.columnSpan,
    rowSpan: opts.rowSpan,
    shading: opts.header ? { fill: GREEN, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: lines.map(
      (l) =>
        new Paragraph({
          alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [text(l, { bold: opts.bold || opts.header, size: 16, color: opts.header ? "FFFFFF" : undefined, header: opts.header })],
        }),
    ),
  });
}

function tbl(rows: TableRow[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function headerRow(cells: TableCell[]) {
  return new TableRow({ tableHeader: true, children: cells });
}

function bodyRow(values: string[], opts: { bold?: boolean; rightFrom?: number } = {}) {
  return new TableRow({
    children: values.map((v, i) => cell(v, { bold: opts.bold, right: i >= (opts.rightFrom ?? 99) })),
  });
}

function groupRow(label: string, span: number) {
  return new TableRow({ children: [cell(label, { bold: true, columnSpan: span })] });
}

const sumCo2e = (list: ActivityRecord[]) => list.reduce((s, a) => s + a.co2e, 0);
const tonne = (kg: number) => formatNumber(kgToTonnes(kg), 2);
const qtyUnit = (a: ActivityRecord) => `${formatNumber(a.activityData)} ${a.unit || ""}`.trim();
const evidenceOf = (a: ActivityRecord) =>
  a.attachments && a.attachments.length > 0 ? a.attachments.map((f) => f.name) : ["-"];

// The 9-column activity / EF row used in section 4 (matches the TCFO_R_02 4.1 - 4.3 layout).
function evidenceRow(label: string, a: ActivityRecord) {
  return new TableRow({
    children: [
      cell(label),
      cell(qtyUnit(a)),
      cell("-"),
      cell(a.description || a.note || "-"),
      cell(evidenceOf(a)),
      cell(a.factorId || "-"),
      cell(""),
      cell(""),
      cell(""),
    ],
  });
}

// Shared 9-column header for section 4.
function evidenceHeader() {
  return [
    headerRow([
      cell("แหล่งปล่อยก๊าซเรือนกระจก", { header: true, rowSpan: 2 }),
      cell("ข้อมูลกิจกรรม", { header: true, columnSpan: 4 }),
      cell("ค่า EF", { header: true, columnSpan: 4 }),
    ]),
    headerRow(
      [
        "ลักษณะข้อมูลกิจกรรม",
        "จุดที่ตรวจวัด",
        "ที่มาของข้อมูลกิจกรรม",
        "หลักฐาน/เอกสารอ้างอิง",
        "ที่มาของค่า EF",
        "เป็นค่าที่ได้จากการตรวจวัด",
        "เป็นค่าที่ได้จากหลักฐานการชำระเงิน",
        "เป็นค่าที่ได้จากการประมาณค่า",
      ].map((h) => cell(h, { header: true })),
    ),
  ];
}

export async function downloadWordReport({ company: c, activities, includeScope3, factors }: ReportInput) {
  const current = activities.filter((a) => periodOf(a) === "current");
  const result = calculateTotals(current);
  const scope1 = current.filter((a) => a.scope === "scope1");
  const scope2 = current.filter((a) => a.scope === "scope2");
  const scope3 = current.filter((a) => a.scope === "scope3");
  const scope2Total = sumCo2e(scope2);
  const scope3Total = result.scope3.rawTotal;
  const grandTotal = result.scope1.rawTotal + scope2Total + (includeScope3 ? scope3Total : 0);
  const companyName = c.companyName || "-";
  const period = `${c.reportingPeriodFrom || "-"} – ${c.reportingPeriodTo || "-"}`;

  // Running header on every page except the first (TGO form block: logo | title | form code, org | page, verifier).
  const HW = [1700, 1900, 3500, 1900]; // column widths in dxa, total 9000
  const hCell = (value: string, width: number, opts: { size?: number; bold?: boolean; span?: number; right?: boolean; rowSpan?: number } = {}) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      columnSpan: opts.span,
      rowSpan: opts.rowSpan,
      verticalAlign: "center",
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: value.split("\n").map(
        (line) =>
          new Paragraph({
            alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [text(line, { size: opts.size ?? 18, bold: opts.bold, header: true })],
          }),
      ),
    });
  const runningHeader = new Header({
    children: [
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: HW,
        rows: [
          new TableRow({
            children: [
              hCell("", HW[0], { rowSpan: 3 }),
              hCell("รายงานการปล่อยและดูดกลับก๊าซเรือนกระจก", HW[1] + HW[2], { span: 2, size: 26, bold: true }),
              hCell("TCFO_R_02\nVersion 03: 24/4/2019", HW[3], { size: 16, bold: true, right: true }),
            ],
          }),
          new TableRow({
            children: [
              hCell("องค์กร", HW[1]),
              hCell(companyName, HW[2]),
              new TableCell({
                width: { size: HW[3], type: WidthType.DXA },
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: [
                  new Paragraph({
                    spacing: { after: 0 },
                    children: [
                      text("หน้าที่ ", { size: 18, header: true }),
                      new TextRun({ children: [PageNumber.CURRENT], font: HEAD_FONT, size: 18 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [hCell("หน่วยงานทวนสอบ", HW[1]), hCell("", HW[2]), hCell("", HW[3])],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ],
  });

  // ---------- Cover ----------
  const cover = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 400 },
      children: [text("รายงานการปล่อยและดูดกลับก๊าซเรือนกระจก", { bold: true, size: 36, color: GREEN, header: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [text("ขององค์กร", { bold: true, size: 36, color: GREEN, header: true })],
    }),
    para(`ชื่อองค์กร : ${companyName}${c.companyNameThai ? ` (${c.companyNameThai})` : ""}`, { size: 24 }),
    para(`ที่อยู่/สถานที่ตั้งองค์กร : ${c.address || "-"}`, { size: 24 }),
    para(`วันที่รายงานผล : ${c.registrationDate || "-"}`, { size: 24 }),
    para(`ระยะเวลาในการติดตามผล : ${period}`, { size: 24 }),
    para("เพื่อการทวนสอบและรับรองผลคาร์บอนฟุตพริ้นท์ขององค์กร", { size: 24, align: AlignmentType.CENTER }),
    para("โดย องค์การบริหารจัดการก๊าซเรือนกระจก (องค์การมหาชน)", { size: 24, align: AlignmentType.CENTER }),
  ];

  // ---------- 1. บทนำ ----------
  const intro = [
    "เพื่อสนับสนุนนโยบายสิ่งแวดล้อม อาชีวอนามัยและความปลอดภัยของบริษัท",
    "เพื่อสนับสนุนโครงการ “โรงงานสีเขียวเพื่อสิ่งแวดล้อมที่ดีขึ้นของชุมชน”",
    "เพื่อสนับสนุนการติดตามและปรับปรุงประสิทธิภาพการใช้พลังงานและต้นทุนค่าใช้จ่ายภายในองค์กร",
    "เพื่อส่งเสริมภาพลักษณ์และประชาสัมพันธ์องค์กรในการเป็นผู้ผลิตที่ลดปริมาณการปล่อยก๊าซที่ก่อให้เกิดปรากฏการณ์เรือนกระจก",
  ];

  // ---------- 2. ข้อมูลทั่วไป (label: value lines, as in the form) ----------
  const general = [
    heading("2. ข้อมูลทั่วไป"),
    para(`2.1 ชื่อองค์กร ${companyName}${c.companyNameThai ? ` (${c.companyNameThai})` : ""}`),
    para(`2.2 ที่อยู่/สถานที่ตั้งองค์กร ${c.address || "-"}`),
    para(`2.3 ประเภทของอุตสาหกรรม ${c.industry || "-"}`),
    para(`2.4 ชื่อ-สกุลของผู้ประสานงาน ${c.contactPerson || "-"}`),
    para(`2.5 ชื่อ-สกุลของผู้รับผิดชอบข้อมูล ${c.preparedBy || "-"}`),
    para(`2.6 ระยะเวลาติดตามผล ${c.dataPeriod || period}`),
    para("2.7 แนวทางที่ใช้ในการติดตามผล"),
    para(c.trackingMethodology || "ข้อกำหนดในการคำนวณและรายงานคาร์บอนฟุตพริ้นท์ขององค์กร"),
    para("2.8 ระดับของการรับรอง (Level of Assurance)"),
    para(c.assuranceLevel || "-"),
    para("2.9 ระดับความมีสาระสำคัญ (Materiality Threshold)"),
    para(c.materialityThreshold || "-"),
  ];

  // ---------- 3. ขอบเขต ----------
  const boundary: (Paragraph | Table)[] = [
    heading("3. ขอบเขต", true),
    para("3.1 ขอบเขตขององค์กร", { bold: true }),
    para(`1) แนวทางที่ใช้กำหนดขอบเขตองค์กร ${c.boundaryApproach || "-"}`),
    para(`2) หน่วยสาธารณูปโภค (Facility)/พื้นที่ที่ครอบคลุมในรายงาน ${c.boundaryCoverage || "-"}`),
    para(`3) เอกสารยืนยันขอบเขต ${c.boundaryDocument || "-"}`),
    para("3.1.1 โครงสร้างขององค์กร", { bold: true }),
    para(c.organizationInfo || "-"),
  ];
  if (c.organizationChart) {
    const orgPicture = await imageParagraph(c.organizationChart);
    if (orgPicture) boundary.push(orgPicture);
  }
  boundary.push(para("3.1.3 แผนผังกระบวนการผลิต", { bold: true }));
  const flow = c.processFlowDiagram ? await imageParagraph(c.processFlowDiagram) : null;
  boundary.push(flow ?? para("-"));

  // 3.1.4 Facility x Scope 1/2/3 matrix
  const scopeLines = (list: ActivityRecord[], labelOf: (a: ActivityRecord) => string) =>
    list.length > 0 ? list.map((a, i) => `${i + 1}. ${labelOf(a)}`) : ["-"];
  boundary.push(
    para("3.1.4 ระบุกิจกรรมทั้งหมดขององค์กร", { bold: true }),
    tbl([
      headerRow([
        cell("Facility", { header: true, rowSpan: 2 }),
        cell("กิจกรรมขององค์กรในแต่ละ Facility", { header: true, columnSpan: 3 }),
      ]),
      headerRow(["Scope 1", "Scope 2", "Scope 3"].map((h) => cell(h, { header: true }))),
      new TableRow({
        children: [
          cell(c.boundaryCoverage || "-"),
          cell(scopeLines(scope1, (a) => a.description || a.factorId)),
          cell(scopeLines(scope2, (a) => a.description || a.factorId)),
          cell(includeScope3 ? scopeLines(scope3, (a) => SCOPE3_LABEL[a.subCategory] ?? a.subCategory) : ["-"]),
        ],
      }),
    ]),
    para(""),
    para("3.1.5 ระบุขอบเขตขององค์กรที่เพิ่มเข้ามาหรือขอบเขตที่ไม่รวม (ระบุ Facility ที่เพิ่มเข้ามาหรือไม่นับรวม) พร้อมเหตุผล", {
      bold: true,
    }),
    para(`Scope 1: ${c.scope1Boundary || "-"}`),
    para(`Scope 2: ${c.scope2Boundary || "-"}`),
    para(`Scope 3: ${c.scope3Boundary || "-"}`),
    para("3.2 ขอบเขตการดำเนินงาน", { bold: true }),
    tbl([
      headerRow(["รายการ", "รายละเอียด"].map((h) => cell(h, { header: true }))),
      bodyRow(["1) ก๊าซเรือนกระจกที่พิจารณา", "คาร์บอนไดออกไซด์ (CO2), มีเทน (CH4), ไนตรัสออกไซด์ (N2O), ไฮโดรฟลูออโรคาร์บอน (HFCs), เพอร์ฟลูออโรคาร์บอน (PFCs), ซัลเฟอร์เฮกซะฟลูออไรด์ (SF6), ไนโตรเจนไตรฟลูออไรด์ (NF3)"]),
      bodyRow(["2) ก๊าซเรือนกระจกที่พิจารณาอื่น ๆ เพิ่มเติม", "HCFC-22"]),
      bodyRow(["3) GWP", "IPCC Fifth Assessment Report (AR5)"]),
    ]),
  );
  // 3.2.1 Scope 1 source list, grouped as in the form.
  const s321Rows: TableRow[] = [
    headerRow(
      [
        "Facility",
        "แหล่งปล่อยก๊าซเรือนกระจก (Emission Source) เช่น ระบุอุปกรณ์หลัก/เครื่องจักร/กระบวนการ/กิจกรรม",
        "ที่ตั้ง/ตำแหน่ง",
        "กำลังการผลิต (Capacity)/ลักษณะเฉพาะ (Specification)",
        "ใช้ภายใน",
        "จำหน่ายภายนอก",
        "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)",
      ].map((h) => cell(h, { header: true })),
    ),
  ];
  let n321 = 0;
  for (const [sub, label] of SCOPE1_GROUPS) {
    s321Rows.push(groupRow(label, 7));
    scope1
      .filter((a) => a.subCategory === sub)
      .forEach((a) => {
        n321 += 1;
        s321Rows.push(
          new TableRow({
            children: [
              cell(c.boundaryCoverage || "-"),
              cell(`${n321}. ${a.description || a.factorId}`),
              cell("-"),
              cell(qtyUnit(a)),
              cell("✓"),
              cell("-"),
              cell("-"),
            ],
          }),
        );
      });
  }
  if (n321 === 0) s321Rows.push(bodyRow(["-", "ไม่มี", "-", "-", "-", "-", "-"]));
  boundary.push(
    para("3.2.1 ระบุกิจกรรมที่เป็นแหล่งปล่อยก๊าซเรือนกระจกประเภทที่ 1 ขององค์กร", { bold: true }),
    tbl(s321Rows),
    para("หมายเหตุ:"),
    para("1. มีนัยสำคัญ “มาก” หมายถึง มีปริมาณการปล่อยก๊าซเรือนกระจกตั้งแต่ร้อยละ 5 ของปริมาณการปล่อยก๊าซเรือนกระจกประเภทที่ F+2 ทั้งหมดขององค์กร"),
    para("2. มีนัยสำคัญ “น้อย” หมายถึง มีปริมาณการปล่อยก๊าซเรือนกระจกน้อยกว่าร้อยละ 5 ของปริมาณการปล่อยก๊าซเรือนกระจกประเภทที่ F+2 ทั้งหมดขององค์กร"),
  );

  // 3.2.2 Biogenic / biomass sources (the app does not record biomass, so the form row is "ไม่มี")
  boundary.push(
    para("3.2.2 แหล่งปล่อยก๊าซเรือนกระจกทางตรงที่เกี่ยวข้องกับการใช้ชีวมวลและก๊าซชีวภาพ เพื่อทดแทนการใช้พลังงานและความร้อน", {
      bold: true,
    }),
    tbl([
      headerRow(
        [
          "Facility",
          "แหล่งปล่อยก๊าซเรือนกระจก (Emission Source) เช่น ระบุอุปกรณ์หลัก/เครื่องจักร/กระบวนการ/กิจกรรม",
          "ที่ตั้ง/ตำแหน่ง",
          "กำลังการผลิต (Capacity)/ลักษณะเฉพาะ (Specification)",
          "ใช้ภายใน",
          "จำหน่ายภายนอก",
          "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)",
        ].map((h) => cell(h, { header: true })),
      ),
      bodyRow(["-", "ไม่มี", "-", "-", "-", "-", "-"]),
    ]),
  );

  // 3.2.3 Other direct GHG (e.g. R-22) reported separately: rows whose factor/description mentions R-22
  const otherGhg = scope1.filter((a) => /R-?22\b/i.test(`${a.factorId} ${a.description ?? ""}`));
  boundary.push(
    para("3.2.3 ระบุกิจกรรมที่เป็นแหล่งปล่อยก๊าซเรือนกระจกทางตรงอื่น ๆ ที่ทำการรายงานแยก", { bold: true }),
    para("ในกรณีที่มีการรายงานการปล่อยก๊าซเรือนกระจกชนิดอื่น ๆ ที่ไม่อยู่ในข้อกำหนด เช่น R22 ให้ทำการรายงานแยก"),
    tbl([
      headerRow(
        [
          "Facility",
          "แหล่งปล่อยก๊าซเรือนกระจก (Emission Source) เช่น ระบุอุปกรณ์หลัก/เครื่องจักร/กระบวนการ/กิจกรรม",
          "ที่ตั้ง/ตำแหน่ง",
          "กำลังการผลิต (Capacity)/ลักษณะเฉพาะ (Specification)",
          "ใช้ภายใน",
          "จำหน่ายภายนอก",
          "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)",
        ].map((h) => cell(h, { header: true })),
      ),
      ...(otherGhg.length > 0
        ? otherGhg.map((a) => bodyRow([c.boundaryCoverage || "-", a.description || a.factorId, "-", qtyUnit(a), "✓", "-", "-"]))
        : [bodyRow(["-", "ไม่มี", "-", "-", "-", "-", "-"])]),
    ]),
  );

  // 3.2.4 Scope 2 sources
  const s324Rows: TableRow[] = [
    headerRow(
      [
        "Facility",
        "แหล่งปล่อยก๊าซเรือนกระจก (Emission Source) เช่น ระบุอุปกรณ์หลัก/เครื่องจักร/กระบวนการ/กิจกรรม",
        "ที่ตั้ง/ตำแหน่ง",
        "กำลังการผลิต (Capacity)/ลักษณะเฉพาะ (Specification)",
        "ใช้ภายใน",
        "จำหน่ายภายนอก",
        "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)",
      ].map((h) => cell(h, { header: true })),
    ),
    ...scope2.map((a, i) =>
      bodyRow([c.boundaryCoverage || "-", `${i + 1}. ${a.description || a.factorId}`, "-", qtyUnit(a), "✓", "-", "-"]),
    ),
  ];
  if (scope2.length === 0) s324Rows.push(bodyRow(["-", "ไม่มี", "-", "-", "-", "-", "-"]));
  boundary.push(para("3.2.4 ระบุกิจกรรมที่เป็นแหล่งปล่อยก๊าซเรือนกระจกประเภทที่ 2 ขององค์กร", { bold: true }), tbl(s324Rows));

  // 3.2.5 Energy supplied to external parties
  boundary.push(
    para("3.2.5 พลังงาน/ความร้อน/ไอน้ำที่จำหน่ายให้หน่วยงานภายนอก (Supply to External) (นอกขอบเขตการดำเนินงาน) (out of boundary)", {
      bold: true,
    }),
    tbl([
      headerRow(
        ["อุปกรณ์ / เครื่องจักรที่ผลิตพลังงาน / ความร้อน / ไอน้ำ / กระบวนการ (Source)", "จำหน่ายให้กับ (Supply to)"].map((h) =>
          cell(h, { header: true }),
        ),
      ),
      bodyRow(["1. ไม่มี", "-"]),
      bodyRow(["2.", ""]),
      bodyRow(["3.", ""]),
      bodyRow(["4.", ""]),
    ]),
  );

  // 3.2.6 Scope 3 sources
  const purchased = scope3.filter((a) => a.subCategory === "purchased_goods");
  const s326Rows: TableRow[] = [
    headerRow(
      ["Category", "แหล่งปล่อยก๊าซเรือนกระจก (Emission Source)", "ใช้ภายใน", "จำหน่ายภายนอก", "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)"].map((h) =>
        cell(h, { header: true }),
      ),
    ),
    ...purchased.map((a, i) =>
      bodyRow([`Category 1 Purchased goods and services`, `${i + 1}. ${a.description || a.factorId}`, "✓", "-", "-"]),
    ),
  ];
  if (purchased.length === 0) s326Rows.push(bodyRow(["-", "ไม่มี", "-", "-", "-"]));
  boundary.push(
    para("3.2.6 ระบุกิจกรรมที่เป็นแหล่งปล่อยก๊าซเรือนกระจกประเภทที่ 3 ขององค์กร", { bold: true }),
    tbl(s326Rows),
    para("หมายเหตุ:"),
    para("1. มีนัยสำคัญ “มาก” หมายถึง มีปริมาณการปล่อยก๊าซเรือนกระจกตั้งแต่ร้อยละ 5 ของปริมาณการปล่อยก๊าซเรือนกระจกประเภทที่ F+2+3 ทั้งหมดขององค์กร"),
    para("2. มีนัยสำคัญ “น้อย” หมายถึง มีปริมาณการปล่อยก๊าซเรือนกระจกน้อยกว่าร้อยละ 5 ของปริมาณการปล่อยก๊าซเรือนกระจกประเภทที่ F+2+3 ทั้งหมดขององค์กร"),
  );

  // 3.2.7 Carbon sink / reservoir
  boundary.push(
    para("3.2.7 การกักเก็บคาร์บอน", { bold: true }),
    tbl([
      headerRow(["รายชื่อกระบวนการ (Sink / Reservoir)", "กำลังการผลิต (Capacity)", "ที่ตั้ง / ตำแหน่ง", "ความสำคัญ (มีนัยสำคัญมาก หรือ น้อย)"].map((h) => cell(h, { header: true }))),
      bodyRow(["1. ไม่มี", "-", "-", "-"]),
      bodyRow(["2.", "", "", ""]),
      bodyRow(["3.", "", "", ""]),
      bodyRow(["4.", "", "", ""]),
    ]),
  );

  // ---------- 4. การติดตามผล ----------
  const monitoring: (Paragraph | Table)[] = [heading("4. การติดตามผล", true)];

  const rows41: TableRow[] = [...evidenceHeader()];
  let n41 = 0;
  for (const [sub, label] of SCOPE1_GROUPS) {
    rows41.push(groupRow(label, 9));
    scope1
      .filter((a) => a.subCategory === sub)
      .forEach((a) => {
        n41 += 1;
        rows41.push(evidenceRow(`${n41}. ${a.description || a.factorId}`, a));
      });
  }
  if (n41 === 0) rows41.push(bodyRow(["-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  monitoring.push(para("4.1 แหล่งปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 1", { bold: true }), tbl(rows41));

  const rows42: TableRow[] = [...evidenceHeader()];
  scope2.forEach((a, i) => rows42.push(evidenceRow(`${i + 1}. ${a.description || a.factorId}`, a)));
  if (scope2.length === 0) rows42.push(bodyRow(["-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  monitoring.push(
    para("4.2 แหล่งปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 2", { bold: true }),
    tbl(rows42),
  );

  {
    const s3 = includeScope3 ? scope3 : [];
    const rows43: TableRow[] = [...evidenceHeader()];
    const subs = [...new Set(s3.map((a) => a.subCategory))];
    let n43 = 0;
    for (const sub of subs) {
      rows43.push(groupRow(SCOPE3_LABEL[sub] ?? sub, 9));
      s3
        .filter((a) => a.subCategory === sub)
        .forEach((a) => {
          n43 += 1;
          rows43.push(evidenceRow(`${n43}. ${a.description || a.factorId}`, a));
        });
    }
    if (n43 === 0) rows43.push(bodyRow(["-", "-", "-", "-", "-", "-", "-", "-", "-"]));
    monitoring.push(
      para("4.3 แหล่งปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 3", { bold: true }),
      tbl(rows43),
    );
  }

  // 4.4 Separately reported GHG (e.g. R-22), same matching rule as 3.2.3
  const rows44: TableRow[] = [...evidenceHeader()];
  const reportedSeparately = scope1.filter((a) => /R-?22\b/i.test(`${a.factorId} ${a.description ?? ""}`));
  reportedSeparately.forEach((a, i) => rows44.push(evidenceRow(`${i + 1}. ${a.description || a.factorId}`, a)));
  if (reportedSeparately.length === 0) rows44.push(bodyRow(["-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  monitoring.push(
    para("4.4 แหล่งปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทรายงานแยกเพิ่มเติม", { bold: true }),
    tbl(rows44),
  );

  // ---------- 5. สรุปปริมาณการปล่อยก๊าซเรือนกระจก ----------
  const gasHeader = () =>
    [
      headerRow([
        cell("แหล่งปล่อยก๊าซเรือนกระจก", { header: true, rowSpan: 2 }),
        cell("ปริมาณการปล่อยก๊าซเรือนกระจก (TonCO2e)", { header: true, columnSpan: GAS_COLUMNS.length }),
        cell("รวมปริมาณก๊าซเรือนกระจก (TonCO2e)", { header: true, rowSpan: 2 }),
      ]),
      headerRow(GAS_COLUMNS.map((g) => cell(g, { header: true }))),
    ];
  const gasCells = () => GAS_COLUMNS.map(() => "-");

  const rows51: TableRow[] = [...gasHeader()];
  let n51 = 0;
  for (const [sub, label] of SCOPE1_GROUPS) {
    rows51.push(groupRow(label, GAS_COLUMNS.length + 2));
    scope1
      .filter((a) => a.subCategory === sub)
      .forEach((a) => {
        n51 += 1;
        rows51.push(
          new TableRow({
            children: [
              cell(`${n51}. ${a.description || a.factorId}`),
              ...gasCells().map((v) => cell(v, { right: true })),
              cell(tonne(a.co2e), { right: true }),
            ],
          }),
        );
      });
  }
  rows51.push(
    new TableRow({
      children: [
        cell("รวมทั้งหมด", { bold: true }),
        ...gasCells().map((v) => cell(v, { right: true, bold: true })),
        cell(tonne(result.scope1.rawTotal), { right: true, bold: true }),
      ],
    }),
  );

  const summary: (Paragraph | Table)[] = [
    heading("5. สรุปปริมาณการปล่อยก๊าซเรือนกระจก", true),
    para("5.1 การปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 1", { bold: true }),
    para("เฉพาะประเภทที่ 1 ให้แยกชนิดก๊าซในแต่ละแหล่งปล่อย (ระบบบันทึกค่ารวมเป็น CO2e จึงแสดงเฉพาะรวมปริมาณ)", {
      size: 16,
      color: GREY,
    }),
    tbl(rows51),
    para("5.2 การปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 2", { bold: true }),
    tbl([
      headerRow(["แหล่งปล่อยก๊าซเรือนกระจก", "ปริมาณการปล่อย GHG (tonCO2e)"].map((h) => cell(h, { header: true }))),
      ...scope2.map((a, i) => bodyRow([`${i + 1}. ${a.description || a.factorId}`, tonne(a.co2e)], { rightFrom: 1 })),
      bodyRow(["รวมทั้งหมด", tonne(scope2Total)], { bold: true, rightFrom: 1 }),
    ]),
  ];

  {
    const byCategory = new Map<SubCategory, number>();
    if (includeScope3) scope3.forEach((a) => byCategory.set(a.subCategory, (byCategory.get(a.subCategory) ?? 0) + a.co2e));
    const s3Rows = [...byCategory.entries()].map(([sub, kg]) => bodyRow([SCOPE3_LABEL[sub] ?? sub, tonne(kg)], { rightFrom: 1 }));
    summary.push(
      para("5.3 การปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่ 3", { bold: true }),
      tbl([
        headerRow(["แหล่งปล่อยก๊าซเรือนกระจก", "ปริมาณการปล่อย GHG (tonCO2e)"].map((h) => cell(h, { header: true }))),
        ...(s3Rows.length > 0 ? s3Rows : [bodyRow(["ไม่มี", "-"], { rightFrom: 1 })]),
        bodyRow(["รวมทั้งหมด", includeScope3 ? tonne(scope3Total) : "-"], { bold: true, rightFrom: 1 }),
      ]),
    );
  }

  summary.push(
    para("5.4 การปล่อยก๊าซเรือนกระจก จากขอบเขตการดำเนินงานประเภทที่รายงานแยกเพิ่มเติม", { bold: true }),
    tbl([
      headerRow(["แหล่งปล่อยก๊าซเรือนกระจก", "ปริมาณการปล่อย GHG (tonCO2e)"].map((h) => cell(h, { header: true }))),
      bodyRow(["ไม่มี", "-"], { rightFrom: 1 }),
      bodyRow(["รวมทั้งหมด", "-"], { bold: true, rightFrom: 1 }),
    ]),
    para("5.5 Carbon Intensity", { bold: true }),
    tbl([
      headerRow(["แหล่งปล่อยก๊าซเรือนกระจก", "ปริมาณ", "หน่วย"].map((h) => cell(h, { header: true }))),
      bodyRow(["ประเภทที่ 1", tonne(result.scope1.rawTotal), "TonCO2e"], { rightFrom: 1 }),
      bodyRow(["ประเภทที่ 2", tonne(scope2Total), "TonCO2e"], { rightFrom: 1 }),
      ...(includeScope3 ? [bodyRow(["ประเภทที่ 3", tonne(scope3Total), "TonCO2e"], { rightFrom: 1 })] : []),
      bodyRow(["ผลรวม (ประเภทที่ 1+2)", tonne(result.scope1.rawTotal + scope2Total), "TonCO2e"], { bold: true, rightFrom: 1 }),
      ...(includeScope3
        ? [bodyRow(["ผลรวม (ประเภทที่ 1+2+3)", tonne(grandTotal), "TonCO2e"], { bold: true, rightFrom: 1 })]
        : []),
      bodyRow(["ผลผลิต", "-", "Ton"], { rightFrom: 1 }),
      bodyRow(["Carbon Intensity (ประเภทที่ 1+2)", "-", "TonCO2e/Ton"], { rightFrom: 1 }),
      ...(includeScope3
        ? [bodyRow(["Carbon Intensity (ประเภทที่ 1+2+3)", "-", "TonCO2e/Ton"], { rightFrom: 1 })]
        : []),
    ]),
    para(
      `หมายเหตุ: Sheet FR-04 แสดงทศนิยม 2 ตำแหน่ง; Sheet FR-05 แสดงเป็นจำนวนเต็มโดยใช้สูตร Roundup (ปริมาณรวมทุกขอบเขต ${formatInt(result.grandTotalRounded)} kgCO2e)`,
      { size: 16, color: GREY },
    ),
  );

  // ---------- 6. ปีฐาน ----------
  const base = c.baseYearEmissions;
  const baseSection: (Paragraph | Table)[] = [
    heading("6. ปีฐาน", true),
    para("6.1 ปีฐานที่ใช้ในการอ้างอิง", { bold: true }),
    para(c.basePeriodYear ? `บริษัท กำหนดปี ${c.basePeriodYear} เป็นปีฐาน` : c.basePeriod ? `บริษัท กำหนดปี ${c.basePeriod} เป็นปีฐาน` : "-"),
    para("6.2 ขอบเขตการดำเนินงานในปีฐาน", { bold: true }),
    tbl([
      headerRow(
        ["ขอบเขตการดำเนินงาน", "รายการแหล่งปล่อยก๊าซเรือนกระจก", "ปริมาณการปล่อยก๊าซเรือนกระจกของปีฐาน (tonCO2e)", "หมายเหตุ"].map((h) =>
          cell(h, { header: true }),
        ),
      ),
      ...(base
        ? [
            bodyRow(["ขอบเขตที่ 1", "-", formatNumber(base.scope1, 2), "-"], { rightFrom: 2 }),
            bodyRow(["ขอบเขตที่ 2", "-", formatNumber(base.scope2, 2), "-"], { rightFrom: 2 }),
            bodyRow(["ขอบเขตที่ 3", "-", formatNumber(base.scope3, 2), "-"], { rightFrom: 2 }),
            bodyRow(["รายงานแยกอื่น ๆ", "-", formatNumber(base.other, 2), "-"], { rightFrom: 2 }),
            bodyRow(["รวม", "-", formatNumber(base.total, 2), "-"], { bold: true, rightFrom: 2 }),
          ]
        : [bodyRow(["-", "ยังไม่ได้บันทึกข้อมูลปีฐาน", "-", "-"])]),
    ]),
    para("6.3 ระบุความแตกต่างระหว่างการรายงานปริมาณก๊าซเรือนกระจกของปีฐานและปีปัจจุบัน พร้อมให้เหตุผล", { bold: true }),
    tbl([
      headerRow(["ความแตกต่าง", "เหตุผล"].map((h) => cell(h, { header: true }))),
      bodyRow(["-", "-"]),
    ]),
  ];

  // ---------- 7. การจัดการคุณภาพของข้อมูล ----------
  const qualitySection: (Paragraph | Table)[] = [
    heading("7. การจัดการคุณภาพของข้อมูล", true),
    para("7.1 โครงสร้างของระบบการจัดการคุณภาพของข้อมูล", { bold: true }),
    tbl([
      headerRow(["บทบาท", "ชื่อ-สกุล", "ตำแหน่ง", "หน้าที่"].map((h) => cell(h, { header: true }))),
      ...(c.qualityRoles && c.qualityRoles.length > 0
        ? c.qualityRoles.map((r) => bodyRow([r.role || "-", r.name || "-", r.position || "-", r.duty || "-"]))
        : [bodyRow(["-", "-", "-", "-"])]),
    ]),
    para("7.2 แผนผังการจัดการคุณภาพของข้อมูล", { bold: true }),
  ];
  const diagrams = c.qualityDiagrams ?? [];
  if (diagrams.length === 0) qualitySection.push(para("-"));
  for (const url of diagrams) {
    const picture = await imageParagraph(url);
    qualitySection.push(picture ?? para("-"));
  }
  qualitySection.push(
    para("7.3 บันทึกการสอบเทียบวัดมาตรฐานของอุปกรณ์/เครื่องมือวัด (Calibration Record)", { bold: true }),
    tbl([
      headerRow(
        [
          "ขอบเขต (แหล่งปล่อยก๊าซเรือนกระจก)",
          "อุปกรณ์/เครื่องมือวัด (เครื่องที่)",
          "ผู้ทำการสอบเทียบ / แหล่งที่เทียบวัด",
          "ความแม่นยำของอุปกรณ์/เครื่องมือวัดที่ยอมรับได้หรือที่กำหนดไว้",
          "ค่าความผิดพลาดของอุปกรณ์/เครื่องมือวัดที่วัดได้",
          "เอกสารอ้างอิง",
        ].map((h) => cell(h, { header: true })),
      ),
      ...(c.calibrationRecords && c.calibrationRecords.length > 0
        ? c.calibrationRecords.map((r) =>
            bodyRow([r.scope || "-", r.equipment || "-", r.calibrator || "-", r.accuracy || "-", r.measuredError || "-", r.reference || "-"]),
          )
        : [bodyRow(["-", "-", "-", "-", "-", "-"])]),
    ]),
  );

  // ---------- 8. ความไม่แน่นอน ----------
  const reportYear = Number(c.reportingYear) || new Date().getFullYear();
  const uncertaintyItems = buildUncertaintyItems(activities, c, factors ?? [], reportYear, getUncertaintyScores());
  const levelText = (l: UncertaintyLevel | null) => (l ? `ระดับ ${l.level} (${l.description}, ${l.quality})` : "-");
  const uncertaintySection: (Paragraph | Table)[] = [
    heading("8. ความไม่แน่นอน", true),
    para("8.1 ตารางการประเมินความไม่แน่นอนของข้อมูลกิจกรรมและค่า EF", { bold: true }),
    para("คะแนนรวม = คะแนนข้อมูลกิจกรรม (A) × คะแนนค่า EF (B) เทียบกับเกณฑ์ระดับคุณภาพ (Report TGO Workshop หน้า 30–31)"),
    tbl([
      headerRow(
        ["ขอบเขต", "รายการ", "จำนวนเดือน", "A (ข้อมูลกิจกรรม)", "B (ค่า EF)", "A×B", "ระดับความไม่แน่นอน"].map((h) =>
          cell(h, { header: true }),
        ),
      ),
      ...(uncertaintyItems.length > 0
        ? uncertaintyItems.map((it) =>
            bodyRow([
              SCOPE_LABEL[it.scope] || it.scope,
              [it.factorName, it.description, it.note].filter(Boolean).join(" · ") || "-",
              String(it.months),
              String(it.activityScore),
              String(it.efScore),
              String(it.score),
              levelText(it.level),
            ]),
          )
        : [bodyRow(["-", "ไม่มีรายการกิจกรรมในปีที่รายงาน", "-", "-", "-", "-", "-"])]),
    ]),
    para("8.2 เกณฑ์ระดับคุณภาพของข้อมูล", { bold: true }),
    tbl([
      headerRow(["ระดับ", "คะแนนรวม", "คำอธิบาย", "คุณภาพของข้อมูล"].map((h) => cell(h, { header: true }))),
      ...UNCERTAINTY_LEVELS.map((l) => bodyRow([String(l.level), `${l.min}–${l.max}`, l.description, l.quality])),
    ]),
  ];

  // ---------- ภาคผนวก: หลักเกณฑ์ในการคัดเลือกขอบเขตที่ 3 ----------
  const s3Rows = buildScope3Rows(c, activities);
  const appendix: (Paragraph | Table)[] = [
    heading("ภาคผนวก: หลักเกณฑ์ในการคัดเลือกขอบเขตที่ 3", true),
    para("การประเมินความมีนัยสำคัญของการปล่อยก๊าซเรือนกระจกทางอ้อม (Scope 3) มีหลักเกณฑ์ดังนี้"),
    tbl([
      headerRow(["ประเด็นที่พิจารณา", "คำอธิบาย"].map((h) => cell(h, { header: true }))),
      ...SCOPE3_CRITERIA.map(([k, v]) => bodyRow([k, v])),
    ]),
    para("ตารางการประเมินความมีนัยสำคัญของ Scope 3", { bold: true }),
    tbl([
      headerRow(
        ["No", "Category", "ปริมาณ (tCO2e)", "สัดส่วน (%)", "Magnitude", "Level of influence", "Risk / Opportunity", "คะแนนรวม", "มีนัยสำคัญ", "Remark"].map((h) =>
          cell(h, { header: true }),
        ),
      ),
      ...s3Rows.map((r) =>
        bodyRow([
          String(r.no),
          r.name,
          formatNumber(r.tCO2e, 2),
          r.sharePct.toFixed(2),
          String(r.magnitude),
          String(r.influence),
          String(r.riskOpportunity),
          r.total.toFixed(2),
          r.significant ? "ใช่" : "ไม่",
          r.remark || "-",
        ]),
      ),
    ]),
    para(
      "หมายเหตุ: คะแนนรวม = Magnitude 50% + Level of influence 30% + Risk/Opportunity 20% ; ถือว่ามีนัยสำคัญเมื่อคะแนนรวมมากกว่า 3",
      { size: 16, color: GREY },
    ),
  ];

  const intro1 = [heading("1. บทนำ", true), ...intro.map((line) => para(`• ${line}`))];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_PT } } } },
    sections: [
      {
        properties: { titlePage: true },
        headers: {
          default: runningHeader,
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        children: [
          ...cover,
          ...intro1,
          ...general,
          ...boundary,
          ...monitoring,
          ...summary,
          ...baseSection,
          ...qualitySection,
          ...uncertaintySection,
          ...appendix,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TCFO_R_02_${c.companyName || "company"}_${c.reportingYear || ""}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
