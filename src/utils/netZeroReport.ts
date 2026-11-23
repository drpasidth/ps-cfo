// Word (.docx) export of the Net Zero Pathway plan.
// Sections: 1 เป้าหมายตาม Scope, 2 กราฟเส้นทางการลด (ภาพ), 3 ตารางรายปี, 4 แผนโครงการ, 5 การแจ้งเตือน, 6 การจัดทำและอนุมัติ
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { CompanyProfile } from "../types";
import {
  INITIATIVE_SCOPE_LABEL,
  INITIATIVE_STATUS_LABEL,
  SCOPE_KEYS,
  SCOPE_LABEL,
  type Baselines,
  type NetZeroPlan,
  type PathwayYear,
  type PlanAlert,
} from "../data/netZeroPathway";
import { formatNumber } from "./calculations";

export interface NetZeroReportInput {
  company: CompanyProfile;
  plan: NetZeroPlan;
  baselines: Baselines;
  rows: PathwayYear[];
  alerts: PlanAlert[];
  reportingYear: number;
}

const FONT = "TH SarabunPSK"; // เนื้อหา 16 pt เหมือนรายงาน TGO
const HEAD_FONT = "Tahoma";
const BODY_PT = 32; // หน่วย half-point: 32 = 16 pt
const GREEN = "166534";

function run(value: string, o: { bold?: boolean; size?: number; color?: string; head?: boolean } = {}) {
  return new TextRun({
    text: value,
    font: o.head ? HEAD_FONT : FONT,
    bold: o.bold,
    size: o.head ? o.size : BODY_PT,
    color: o.color,
  });
}

function para(value: string, o: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({ alignment: o.align, spacing: { after: 80 }, children: [run(value, o)] });
}

function heading(value: string, pageBreak = false) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore: pageBreak,
    spacing: { before: 240, after: 120 },
    children: [run(value, { bold: true, size: 24, color: GREEN, head: true })],
  });
}

function cell(value: string, o: { header?: boolean; right?: boolean; bold?: boolean } = {}) {
  return new TableCell({
    shading: o.header ? { fill: GREEN, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          run(value, {
            bold: o.bold || o.header,
            size: 16,
            color: o.header ? "FFFFFF" : undefined,
            head: o.header,
          }),
        ],
      }),
    ],
  });
}

function table(header: string[], body: string[][], rightFrom = 99, boldLast = false) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h) => cell(h, { header: true })) }),
      ...body.map(
        (r, idx) =>
          new TableRow({
            children: r.map((v, i) => cell(v, { right: i >= rightFrom && i > 0, bold: boldLast && idx === body.length - 1 })),
          }),
      ),
    ],
  });
}

const n1 = (v: number) => formatNumber(v, 1);
const pct = (v: number) => `${formatNumber(v, 1)}%`;

// กราฟเส้นทางการลด วาดด้วย canvas เป็น PNG (ขนาด 1200x560)
export function renderPathwayPng(
  rows: { year: number; target: number; actual: number | null; withPlan: number }[],
  interimYear: number,
): Uint8Array | null {
  if (rows.length === 0) return null;
  const W = 1200;
  const H = 560;
  const L = 130;
  const R = 40;
  const T = 70;
  const B = 80;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const maxValue =
    Math.max(
      1,
      ...rows.map((r) => r.target),
      ...rows.map((r) => r.withPlan),
      ...rows.flatMap((r) => (r.actual === null ? [] : [r.actual])),
    ) * 1.1;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const x = (i: number) => L + ((i + 0.5) * plotW) / rows.length;
  const y = (v: number) => H - B - (v / maxValue) * plotH;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.font = "24px 'TH SarabunPSK', Tahoma, sans-serif";

  // legend
  const legend: [string, string, boolean][] = [
    ["#059669", "เป้าหมาย", false],
    ["#f97316", "หลังใช้แผนโครงการ", true],
    ["#2563eb", "ค่าจริง", false],
  ];
  let lx = L;
  for (const [color, label, dashed] of legend) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash(dashed ? [10, 6] : []);
    ctx.beginPath();
    ctx.moveTo(lx, 30);
    ctx.lineTo(lx + 40, 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 50, 38);
    lx += 50 + ctx.measureText(label).width + 40;
  }

  // axes and y ticks
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, T);
  ctx.lineTo(L, H - B);
  ctx.lineTo(W - R, H - B);
  ctx.stroke();
  ctx.fillStyle = "#374151";
  ctx.textAlign = "right";
  for (let k = 0; k <= 4; k++) {
    const v = (maxValue / 1.1) * (k / 4);
    ctx.fillText(formatNumber(v, 0), L - 10, y(v) + 8);
  }

  // x ticks: ปีฐาน ปีระยะกลาง ปี Net Zero และช่วงห่างสม่ำเสมอ
  const step = Math.max(1, Math.ceil(rows.length / 12));
  ctx.textAlign = "center";
  rows.forEach((r, i) => {
    const isKey = r.year === rows[0].year || r.year === interimYear || i === rows.length - 1;
    if (i % step !== 0 && !isKey) return;
    ctx.strokeStyle = "#e5e7eb";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x(i), T);
    ctx.lineTo(x(i), H - B);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#374151";
    ctx.fillText(String(r.year), x(i), H - B + 32);
  });

  const polyline = (values: number[], color: string, dashed: boolean, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [12, 8] : []);
    ctx.beginPath();
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  polyline(rows.map((r) => r.withPlan), "#f97316", true, 3);
  polyline(rows.map((r) => r.target), "#059669", false, 4);
  rows.forEach((r, i) => {
    if (r.actual === null) return;
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(x(i), y(r.actual), 7, 0, Math.PI * 2);
    ctx.fill();
  });

  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1];
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

export async function downloadNetZeroWord({ company, plan, baselines, rows, alerts, reportingYear }: NetZeroReportInput) {
  const baselineTotal = SCOPE_KEYS.reduce((t, s) => t + baselines[s], 0);
  const interimRow = rows.find((r) => r.year === plan.interimYear) ?? null;
  const netZeroRow = rows.find((r) => r.year === plan.netZeroYear) ?? null;
  const companyName = company.companyName || "-";

  // 1. เป้าหมายตาม Scope
  const scopeBody = SCOPE_KEYS.map((s) => {
    const t = plan.scopeTargets[s];
    const target = (pctValue: number) => baselines[s] * (1 - pctValue / 100);
    return [
      SCOPE_LABEL[s],
      n1(baselines[s]),
      pct(t.interimPct),
      n1(target(t.interimPct)),
      pct(t.netZeroPct),
      n1(target(t.netZeroPct)),
    ];
  });
  const totalInterim = interimRow?.target ?? baselineTotal;
  const totalNetZero = netZeroRow?.target ?? baselineTotal;
  scopeBody.push([
    "รวม",
    n1(baselineTotal),
    pct(baselineTotal ? (1 - totalInterim / baselineTotal) * 100 : 0),
    n1(totalInterim),
    pct(baselineTotal ? (1 - totalNetZero / baselineTotal) * 100 : 0),
    n1(totalNetZero),
  ]);

  // 2. กราฟ
  const chartPng = renderPathwayPng(
    rows.map((r) => ({ year: r.year, target: r.target, actual: r.actual, withPlan: r.target + r.gap })),
    plan.interimYear,
  );
  const chartParagraph = chartPng
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new ImageRun({ type: "png", data: chartPng, transformation: { width: 620, height: 289 } })],
      })
    : para("(ไม่มีข้อมูลสำหรับสร้างกราฟ)");

  // 3. ตารางรายปี
  const yearBody = rows.map((r) => [
    String(r.year),
    n1(r.target),
    r.actual === null ? "-" : n1(r.actual),
    n1(r.required),
    n1(r.planned),
    n1(r.gap),
    r.year === plan.baseYear ? "ปีฐาน" : r.actual === null ? "ยังไม่มีข้อมูล" : r.gap > 0 ? "ยังขาดการลด" : "ครอบคลุม",
  ]);

  // 4. แผนโครงการ
  const initiativeBody = plan.initiatives.map((i) => [
    i.name || "(ยังไม่ตั้งชื่อ)",
    INITIATIVE_SCOPE_LABEL[i.scope],
    String(i.startYear),
    n1(i.reductionTco2e),
    INITIATIVE_STATUS_LABEL[i.status],
    `${i.progress}%`,
    i.dueDate || "-",
    i.owner || "-",
  ]);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [run("แผนการลดก๊าซเรือนกระจกสู่ Net Zero (Net Zero Pathway)", { bold: true, size: 32, color: GREEN, head: true })],
    }),
    para(`${companyName}${company.companyNameThai ? ` (${company.companyNameThai})` : ""}`, { bold: true, align: AlignmentType.CENTER }),
    para(`ปีที่รายงาน ${reportingYear} · ปีฐาน ${plan.baseYear} · ระยะกลาง ${plan.interimYear} · Net Zero ${plan.netZeroYear}`, {
      align: AlignmentType.CENTER,
    }),

    heading("1. เป้าหมายแยกตาม Scope"),
    para(
      `การปล่อยปีฐานรวม ${n1(baselineTotal)} tCO2e · เป้าหมายระยะกลาง (ปี ${plan.interimYear}) ${n1(totalInterim)} tCO2e · เป้าหมาย Net Zero (ปี ${plan.netZeroYear}) ${n1(totalNetZero)} tCO2e (ส่วนที่ต้องชดเชยในปี Net Zero)`,
    ),
    table(
      ["Scope", "ปีฐาน (tCO2e)", `% ลดระยะกลาง`, `เป้าปี ${plan.interimYear} (tCO2e)`, `% ลด Net Zero`, `เป้าปี ${plan.netZeroYear} (tCO2e)`],
      scopeBody,
      1,
      true,
    ),

    heading("2. เส้นทางการลดก๊าซเรือนกระจก", true),
    para("เส้นทึบสีเขียว = เป้าหมาย · เส้นประสีส้ม = ปริมาณที่คาดว่าจะเหลือหลังใช้แผนโครงการ · จุดสีน้ำเงิน = ค่าจริงจากกิจกรรม (tCO2e)"),
    chartParagraph,

    heading("3. เป้าหมายและผลการดำเนินงานรายปี", true),
    para("ค่าจริงดึงจากกิจกรรมที่บันทึกไว้ · ช่องว่าง = ปริมาณที่ต้องลดเพิ่มจากแผนที่มีอยู่ (ค่าบวก = ยังขาด)"),
    table(
      ["ปี", "เป้าหมายรวม (tCO2e)", "ค่าจริงรวม (tCO2e)", "ต้องลดจากปีฐาน", "ลดได้ตามแผน", "ช่องว่าง", "สถานะ"],
      yearBody,
      1,
    ),

    heading("4. แผนโครงการ/มาตรการลดก๊าซ", true),
    initiativeBody.length === 0
      ? para("ยังไม่มีโครงการ")
      : table(
          ["โครงการ/มาตรการ", "Scope", "ปีเริ่มให้ผล", "ลดได้ (tCO2e/ปี)", "สถานะ", "ความคืบหน้า", "กำหนดเสร็จ", "ผู้รับผิดชอบ"],
          initiativeBody,
          3,
        ),

    heading("5. การแจ้งเตือนและการติดตาม"),
    ...(alerts.length === 0
      ? [para("ไม่มีรายการที่ต้องติดตาม")]
      : alerts.map((a) => para(`• ${a.text}`))),

    heading("6. การจัดทำและอนุมัติ"),
    para(`จัดทำโดย: ${company.preparedBy || "-"}`),
    para(`ตรวจทานโดย: ${company.reviewedBy || "-"}`),
    para(`อนุมัติโดย: ${company.approvedBy || "-"}`),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NetZero_Pathway_${company.companyName || "company"}_${reportingYear}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
