import JSZip from "jszip";
import type { ActivityRecord, AppData } from "../types";
import { periodOf } from "../types";
import { getScope1EfData } from "../data/scope1Reference";
import { findFactor } from "../data/emissionFactors";
import { baseYearTotalsT } from "./calculations";
import { buildScope3Rows } from "./scope3Significance";
import { getScope3Criteria } from "../data/scope3CriteriaTable";

// Sheet name → worksheet filename mapping (from xl/_rels/workbook.xml.rels)
const SHEET_FILES: Record<string, string> = {
  "Fr-01":   "xl/worksheets/sheet1.xml",
  "Fr-02":   "xl/worksheets/sheet2.xml",
  "Fr-03.1": "xl/worksheets/sheet3.xml",
  "Fr-03.2": "xl/worksheets/sheet4.xml",
  "Fr-04.1": "xl/worksheets/sheet5.xml",
  "Fr-04.2": "xl/worksheets/sheet6.xml",
  "Fr-05":   "xl/worksheets/sheet7.xml",
};

// Known fixed cell targets per sheet (row/col 0-based from inspection)
// Each entry: { sheet, addr, label } – we find the NEXT cell to the right of label and write value.
// Alternatively we store the exact target address directly.
// From inspection:
//   Fr-01  G3=company (next is H3), B6=company (self label, fill next cell C6? No – B6 IS the label row)
// Actually from the data: G3 contains the LABEL "ชื่อองค์กรที่ขอขึ้นทะเบียน" and the NEXT cell H3 is the value.
// But wait from Fr-01 output: addr G3 is the label and the value cell should be H3.
// Let's confirm by looking at the actual template values...

// We'll patch by: for each label cell, fill the NEXT column cell with the value.
// Special: Fr-04.1 rows 11..23: B=description, C=unit, D=quantity

// Actually let's just hardcode the EXACT target addresses from inspection:
// Fr-01: H3=company, C4=preparer(?), wait – let me re-read:
//   G3 = "ชื่อองค์กรที่ขอขึ้นทะเบียน" label → value is in H3
//   E4 = "ผู้จัดทำ" label → value is in F4 (but template shows F4 blank then G3=label)
//   B6 = "ชื่อองค์กรที่ขอขึ้นทะเบียน" label → value in C6 (the big org name field)

// Exact target addresses (where to WRITE the value):
// Addresses are the top-left (anchor) cell of each merged value area in the current template.
// Values in non-anchor cells of a merge are hidden, so they must not be used.
const TARGETS: Array<{ sheet: string; addr: string; field: keyof PatchFields }> = [
  // Fr-01 (รายละเอียดขององค์กร)
  { sheet: "Fr-01",   addr: "I1",  field: "documentName" },
  { sheet: "Fr-01",   addr: "I2",  field: "documentVersion" },
  { sheet: "Fr-01",   addr: "G3",  field: "company" },
  { sheet: "Fr-01",   addr: "G4",  field: "preparer" },
  { sheet: "Fr-01",   addr: "J4",  field: "documentDate" },
  { sheet: "Fr-01",   addr: "H9",  field: "scope1Boundary" },    // ประเภท 1  (H9:J12)
  { sheet: "Fr-01",   addr: "H13", field: "scope2Boundary" },    // ประเภท 2  (H13:J15)
  { sheet: "Fr-01",   addr: "H16", field: "scope3Boundary" },    // ประเภท 3  (H16:J16)
  { sheet: "Fr-01",   addr: "H17", field: "dataPeriod" },        // ระยะเวลาเก็บข้อมูล
  { sheet: "Fr-01",   addr: "H19", field: "basePeriod" },        // ปีฐาน
  { sheet: "Fr-01",   addr: "J18", field: "emissionUnit" },      // หน่วยปีปัจจุบัน
  { sheet: "Fr-01",   addr: "J20", field: "emissionUnit" },      // หน่วยปีฐาน
  { sheet: "Fr-01",   addr: "G22", field: "orgInfo1" },          // ที่อยู่
  { sheet: "Fr-01",   addr: "G23", field: "orgInfo2" },          // ประเภทธุรกิจ
  { sheet: "Fr-01",   addr: "G24", field: "orgInfo3" },          // ขนาดธุรกิจ
  { sheet: "Fr-01",   addr: "G25", field: "orgInfo4" },          // ขอบเขตขององค์กร
  { sheet: "Fr-01",   addr: "G26", field: "orgInfo5" },          // วันจดทะเบียน
  { sheet: "Fr-01",   addr: "G27", field: "contactLocation" },   // สถานที่ติดต่อ
  { sheet: "Fr-01",   addr: "G28", field: "registrationDate" },  // วันที่ขอขึ้นทะเบียน
  // Fr-02 (แผนภาพองค์กร)
  { sheet: "Fr-02",   addr: "L1",  field: "documentName" },
  { sheet: "Fr-02",   addr: "L2",  field: "documentVersion" },
  { sheet: "Fr-02",   addr: "G3",  field: "company" },
  { sheet: "Fr-02",   addr: "G4",  field: "preparer" },
  { sheet: "Fr-02",   addr: "M4",  field: "documentDate" },
  // Fr-03.1 (โครงสร้างองค์กร)
  { sheet: "Fr-03.1", addr: "L1",  field: "documentName" },
  { sheet: "Fr-03.1", addr: "L2",  field: "documentVersion" },
  { sheet: "Fr-03.1", addr: "G3",  field: "company" },
  { sheet: "Fr-03.1", addr: "G4",  field: "preparer" },
  { sheet: "Fr-03.1", addr: "B26", field: "preparer" },
  { sheet: "Fr-03.1", addr: "M4",  field: "documentDate" },
  // Fr-03.2 (Scope 3 assessment)
  { sheet: "Fr-03.2", addr: "O1",  field: "documentName" },
  { sheet: "Fr-03.2", addr: "O2",  field: "documentVersion" },
  { sheet: "Fr-03.2", addr: "F3",  field: "company" },
  { sheet: "Fr-03.2", addr: "F4",  field: "preparer" },
  { sheet: "Fr-03.2", addr: "P4",  field: "documentDate" },
  // Fr-04.1 (บัญชีรายการ ปีปัจจุบัน)
  { sheet: "Fr-04.1", addr: "AO1", field: "documentName" },
  { sheet: "Fr-04.1", addr: "AO2", field: "documentVersion" },
  { sheet: "Fr-04.1", addr: "I3",  field: "company" },
  { sheet: "Fr-04.1", addr: "I4",  field: "preparer" },
  { sheet: "Fr-04.1", addr: "B46", field: "preparer" },
  { sheet: "Fr-04.1", addr: "AR4", field: "documentDate" },
  { sheet: "Fr-04.1", addr: "AE3", field: "dataPeriod" },
  // Fr-04.2 (บัญชีรายการ ปีฐาน)
  { sheet: "Fr-04.2", addr: "AO1", field: "documentName" },
  { sheet: "Fr-04.2", addr: "AO2", field: "documentVersion" },
  { sheet: "Fr-04.2", addr: "I3",  field: "company" },
  { sheet: "Fr-04.2", addr: "I4",  field: "preparer" },
  { sheet: "Fr-04.2", addr: "B46", field: "preparer" },
  { sheet: "Fr-04.2", addr: "AR4", field: "documentDate" },
  { sheet: "Fr-04.2", addr: "AE3", field: "basePeriod" },
  // Fr-05 (สรุป)
  { sheet: "Fr-05",   addr: "I1",  field: "documentName" },
  { sheet: "Fr-05",   addr: "I2",  field: "documentVersion" },
  { sheet: "Fr-05",   addr: "F3",  field: "company" },
  { sheet: "Fr-05",   addr: "F4",  field: "preparer" },
  { sheet: "Fr-05",   addr: "B37", field: "preparer" },
  { sheet: "Fr-05",   addr: "J4",  field: "documentDate" },
  { sheet: "Fr-05",   addr: "B5",  field: "dataPeriod" },
  { sheet: "Fr-05",   addr: "B20", field: "basePeriod" },
];

type PatchFields = {
  emissionUnit: string;
  company: string;
  preparer: string;
  documentName: string;
  documentVersion: string;
  documentDate: string;
  dataPeriod: string;
  basePeriod: string;
  scope1Boundary: string;
  scope2Boundary: string;
  scope3Boundary: string;
  contactLocation: string;
  registrationDate: string;
  orgInfo1: string;
  orgInfo2: string;
  orgInfo3: string;
  orgInfo4: string;
  orgInfo5: string;
};

// Format a Date as dd/mm/yyyy with the Buddhist year (e.g. 21/04/2569)
function formatThaiDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear() + 543}`;
}

// Split the 7-line organization info into orgInfo1..orgInfo5 (the template has 5 rows)
function orgInfoFields(text?: string): Pick<PatchFields, "orgInfo1" | "orgInfo2" | "orgInfo3" | "orgInfo4" | "orgInfo5"> {
  // Keep line positions; strip the "n. label:" prefix so only the value is written
  const lines = (text || "").split(/\r?\n/).map(l =>
    l.trim().replace(/^\d+\.\s*[^:：]*[:：]\s*/, "").trim()
  );
  return {
    orgInfo1: lines[0] || "",
    orgInfo2: lines[1] || "",
    orgInfo3: lines[2] || "",
    orgInfo4: lines[3] || "",
    orgInfo5: lines[4] || "",
  };
}

// Convert a YYYY-MM-DD input value to dd/mm/yyyy with the Buddhist year
function formatIsoDateThai(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
}

interface ActivityRow {
  factorId: string;
  description: string;
  unit: string;
  quantity: number;
}

// Template workbook served from public/
const TEMPLATE_URL = "/Verification_Sheet_Homeland%20D%20Well_2026-11-20.xlsx";

const EMU_PER_PX = 9525;
const MAX_DIGIT_WIDTH = 7; // Excel default font (Calibri 11) max digit width in px

// Tenant pictures placed in the template. `box` is the cell area (0-based, inclusive) the picture
// is scaled to fit and centred in; its top-left cell is where the picture starts.
interface PictureTarget {
  sheet: string;
  drawing: string;
  media: string;
  name: string;
  box: { firstCol: number; lastCol: number; firstRow: number; lastRow: number };
}
const PICTURE_TARGETS = {
  // Fr-01: logo in A8 (left block A8:D28)
  logo: {
    sheet: "xl/worksheets/sheet1.xml",
    drawing: "xl/drawings/drawing1.xml",
    media: "xl/media/tenant_logo.png",
    name: "Company Logo",
    box: { firstCol: 0, lastCol: 3, firstRow: 7, lastRow: 27 },
  },
  // Fr-02: company image in A7 (inside the A6:M26 frame)
  companyImage: {
    sheet: "xl/worksheets/sheet2.xml",
    drawing: "xl/drawings/drawing2.xml",
    media: "xl/media/tenant_company.png",
    name: "Company Image",
    box: { firstCol: 0, lastCol: 12, firstRow: 6, lastRow: 24 },
  },
  // Fr-03.1: organization chart in A8 (inside the A7:M25 dashed frame)
  orgChart: {
    sheet: "xl/worksheets/sheet3.xml",
    drawing: "xl/drawings/drawing3.xml",
    media: "xl/media/tenant_org_chart.png",
    name: "Organization Chart",
    box: { firstCol: 0, lastCol: 12, firstRow: 7, lastRow: 24 },
  },
} satisfies Record<string, PictureTarget>;

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Convert any browser-readable image to PNG (Excel does not reliably accept webp)
async function imageToPngBytes(dataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const img = await loadImageElement(dataUrl);
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
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return { bytes, width: img.naturalWidth, height: img.naturalHeight };
}

// Column widths (px) and row heights (px) of the sheet, for the first `count` columns/rows
function parseColumnPx(sheetXml: string, count: number): number[] {
  const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
  const defaultWidth = Number(attr(sheetXml, "defaultColWidth") ?? 8.43);
  const widths = new Array<number>(count).fill(defaultWidth);
  for (const tag of sheetXml.match(/<col [^>]*>/g) || []) {
    const min = Number(attr(tag, "min"));
    const max = Number(attr(tag, "max"));
    const width = Number(attr(tag, "width"));
    for (let i = min; i <= max && i <= count; i++) widths[i - 1] = width;
  }
  return widths.map((w) => Math.trunc(((256 * w + Math.trunc(128 / MAX_DIGIT_WIDTH)) / 256) * MAX_DIGIT_WIDTH));
}

function parseRowPx(sheetXml: string, count: number): number[] {
  const defaultHeight = Number((sheetXml.match(/defaultRowHeight="([\d.]+)"/) || [])[1] ?? 12.75);
  const heights = new Array<number>(count).fill(defaultHeight); // default row height in points
  for (const tag of sheetXml.match(/<row [^>]*>/g) || []) {
    const r = Number((tag.match(/\br="(\d+)"/) || [])[1]);
    const ht = (tag.match(/\bht="([\d.]+)"/) || [])[1];
    if (r >= 1 && r <= count && ht) heights[r - 1] = Number(ht);
  }
  return heights.map((pt) => (pt * 96) / 72);
}

// Find the cell index and offset (px) for a position measured from the start of `sizes`
function locate(position: number, sizes: number[]): { index: number; offset: number } {
  let index = 0;
  let rest = position;
  while (index < sizes.length - 1 && rest >= sizes[index]) {
    rest -= sizes[index];
    index++;
  }
  return { index, offset: rest };
}

// Remove template chart frames that overlap the target box so the picture replaces them
function removeChartsInBox(drawingXml: string, box: PictureTarget["box"]): string {
  return drawingXml.replace(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g, (anchor) => {
    if (!anchor.includes("<xdr:graphicFrame")) return anchor;
    const from = anchor.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    const to = anchor.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    if (!from || !to) return anchor;
    const overlaps =
      Number(from[1]) <= box.lastCol && Number(to[1]) >= box.firstCol &&
      Number(from[2]) <= box.lastRow && Number(to[2]) >= box.firstRow;
    return overlaps ? "" : anchor;
  });
}

// Grouped bar chart: per scope, current-year bar and base-year bar side by side (PNG data URL)
async function renderCompareChartPng(title: string, groups: { label: string; current: number; base: number }[]): Promise<string> {
  const W = 800, H = 480, L = 80, R = 30, T = 60, B = 60;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const innerW = W - L - R, innerH = H - T - B;
  const max = Math.max(...groups.flatMap((g) => [g.current, g.base]), 0);
  const niceMax = max > 0 ? Math.ceil(max * 1.1 * 100) / 100 : 1;
  const yAt = (v: number) => T + innerH - (v / niceMax) * innerH;

  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  ctx.fillText(title, L, 36);
  ctx.font = "21px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const v = (niceMax * i) / 4;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(v.toFixed(2), L - 10, yAt(v));
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, yAt(v));
    ctx.lineTo(W - R, yAt(v));
    ctx.stroke();
  }
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, yAt(0));
  ctx.lineTo(W - R, yAt(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L, T);
  ctx.lineTo(L, yAt(0));
  ctx.stroke();

  const series = [
    { key: "current" as const, label: "ปีปัจจุบัน", color: "#059669", text: "#065f46" },
    { key: "base" as const, label: "ปีฐาน", color: "#9ca3af", text: "#374151" },
  ];
  const slot = innerW / groups.length;
  const barW = Math.min(90, slot * 0.3);
  ctx.textBaseline = "alphabetic";
  groups.forEach((g, i) => {
    const cx = L + slot * i + slot / 2;
    series.forEach((s, j) => {
      const value = g[s.key];
      const x = cx + (j === 0 ? -barW - 4 : 4);
      const y = yAt(value);
      ctx.fillStyle = s.color;
      ctx.fillRect(x, y, barW, T + innerH - y);
      ctx.textAlign = "center";
      ctx.font = "16px sans-serif";
      ctx.fillStyle = s.text;
      ctx.fillText(value.toFixed(2), x + barW / 2, y - 8);
    });
    ctx.textAlign = "center";
    ctx.font = "21px sans-serif";
    ctx.fillStyle = "#374151";
    ctx.fillText(g.label, cx, H - B + 28);
  });
  // Legend
  ctx.font = "18px sans-serif";
  ctx.textAlign = "left";
  series.forEach((s, j) => {
    const lx = W - R - 200 + j * 110;
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, 20, 16, 16);
    ctx.fillStyle = "#374151";
    ctx.fillText(s.label, lx + 22, 28);
  });
  return canvas.toDataURL("image/png");
}

// Render a bar chart (tCO2e per scope) to a PNG data URL using a canvas
async function renderBarChartPng(title: string, bars: { label: string; value: number }[]): Promise<string> {
  const W = 800, H = 480, L = 80, R = 30, T = 60, B = 60;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const innerW = W - L - R, innerH = H - T - B;
  const max = Math.max(...bars.map((b) => b.value), 0);
  const niceMax = max > 0 ? Math.ceil(max * 1.1 * 100) / 100 : 1;
  const yAt = (v: number) => T + innerH - (v / niceMax) * innerH;

  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.fillText(title, L, 36);
  // Axis tick labels are 50% larger than the original 14px (21px)
  ctx.font = "21px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const v = (niceMax * i) / 4;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(v.toFixed(2), L - 10, yAt(v));
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, yAt(v));
    ctx.lineTo(W - R, yAt(v));
    ctx.stroke();
  }
  // Horizontal base line (x-axis) and vertical axis line (y-axis)
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, yAt(0));
  ctx.lineTo(W - R, yAt(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L, T);
  ctx.lineTo(L, yAt(0));
  ctx.stroke();
  ctx.textBaseline = "alphabetic";
  const slot = innerW / bars.length;
  const barW = Math.min(90, slot * 0.5);
  bars.forEach((b, i) => {
    const cx = L + slot * i + slot / 2;
    const y = yAt(b.value);
    ctx.fillStyle = "#059669";
    ctx.fillRect(cx - barW / 2, y, barW, T + innerH - y);
    ctx.textAlign = "center";
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#065f46";
    ctx.fillText(b.value.toFixed(2), cx, y - 8);
    ctx.font = "21px sans-serif";
    ctx.fillStyle = "#374151";
    ctx.fillText(b.label, cx, H - B + 28);
  });
  return canvas.toDataURL("image/png");
}

// Add a tenant picture to a template sheet's drawing: scaled to fit its box and centred in it,
// anchored at the box's top-left cell.
async function embedPicture(zip: JSZip, target: PictureTarget, dataUrl: string): Promise<void> {
  const drawingFile = zip.file(target.drawing);
  const sheet = zip.file(target.sheet);
  if (!drawingFile || !sheet) return;

  const image = await imageToPngBytes(dataUrl);
  if (!image) return;

  const sheetXml = await sheet.async("string");
  const { firstCol, lastCol, firstRow, lastRow } = target.box;
  const colPx = parseColumnPx(sheetXml, lastCol + 1);
  const rowPx = parseRowPx(sheetXml, lastRow + 1);
  const boxWidth = colPx.slice(firstCol, lastCol + 1).reduce((a, b) => a + b, 0);
  const boxHeight = rowPx.slice(firstRow, lastRow + 1).reduce((a, b) => a + b, 0);

  const PAD = 6;
  const scale = Math.min((boxWidth - PAD * 2) / image.width, (boxHeight - PAD * 2) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (boxWidth - width) / 2;
  const y = (boxHeight - height) / 2;

  const col = locate(x, colPx.slice(firstCol));
  const row = locate(y, rowPx.slice(firstRow));
  const from = {
    col: firstCol + col.index,
    colOff: Math.round(col.offset * EMU_PER_PX),
    row: firstRow + row.index,
    rowOff: Math.round(row.offset * EMU_PER_PX),
  };
  const cx = Math.round(width * EMU_PER_PX);
  const cy = Math.round(height * EMU_PER_PX);

  // Relationship for the image: next free rId in the drawing's rels (create the file if missing)
  const relsPath = target.drawing.replace("/drawings/", "/drawings/_rels/") + ".rels";
  const relsFile = zip.file(relsPath);
  const relsXml = relsFile
    ? await relsFile.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const relIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const relId = `rId${Math.max(0, ...relIds) + 1}`;

  // Append a one-cell picture anchor with a unique shape id to the drawing
  const drawingXml0 = removeChartsInBox(await drawingFile.async("string"), target.box);
  const ids = [...drawingXml0.matchAll(/cNvPr id="(\d+)"/g)].map((m) => Number(m[1]));
  const shapeId = Math.max(1, ...ids) + 1;
  const pic =
    `<xdr:oneCellAnchor>` +
    `<xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>${from.colOff}</xdr:colOff>` +
    `<xdr:row>${from.row}</xdr:row><xdr:rowOff>${from.rowOff}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="${target.name}"/>` +
    `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
    `<xdr:clientData/></xdr:oneCellAnchor>`;
  zip.file(target.drawing, drawingXml0.replace(/<\/xdr:wsDr>\s*$/, `${pic}</xdr:wsDr>`));

  const rel =
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="../media/${target.media.split("/").pop()}"/>`;
  zip.file(relsPath, relsXml.replace("</Relationships>", `${rel}</Relationships>`));
  zip.file(target.media, image.bytes);
}

// Escape XML special characters
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Parse the shared strings XML and return an array of plain text values
function parseSSTValues(xml: string): string[] {
  const matches = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
  return matches.map(m => m[1].replace(/<[^>]+>/g, "").trim());
}

// Add a new entry to sharedStrings XML and return its index
function addSharedString(xml: string, value: string): { xml: string; index: number } {
  // Count existing entries
  const count = (xml.match(/<si>/g) || []).length;
  const escaped = xmlEscape(value);
  const entry = `<si><t xml:space="preserve">${escaped}</t></si>`;
  // Insert before closing tag
  const newXml = xml.replace(/<\/sst>/, entry + "</sst>");
  // Update count and uniqueCount attributes
  const updated = newXml
    .replace(/count="\d+"/, `count="${count + 1}"`)
    .replace(/uniqueCount="\d+"/, `uniqueCount="${count + 1}"`);
  return { xml: updated, index: count };
}

// Append merged ranges to the sheet's <mergeCells> element (updates its count)
function addMergeCells(sheetXml: string, refs: string[]): string {
  if (refs.length === 0) return sheetXml;
  const m = sheetXml.match(/<mergeCells count="(\d+)">/);
  if (!m) return sheetXml;
  const count = Number(m[1]) + refs.length;
  const xml = refs.map((r) => `<mergeCell ref="${r}"/>`).join("");
  return sheetXml
    .replace(m[0], `<mergeCells count="${count}">`)
    .replace("</mergeCells>", `${xml}</mergeCells>`);
}

// Score bands (ระดับ 1–5) occupy these column ranges in Fr-03.2 B37:O59
const CRITERIA_BAND_COLS: Array<[string, string]> = [["C", "D"], ["E", "G"], ["H", "J"], ["K", "M"], ["N", "O"]];

// Write the significance criteria (ตาราง G, from the saved table) into Fr-03.2 B37:O59
function writeScope3CriteriaBlock(sheetXml: string, sst: (text: string) => number): string {
  const table = getScope3Criteria();
  let sx = sheetXml;
  const merges: string[] = [];
  const put = (addr: string, text: string) => {
    sx = setCellSharedString(sx, addr, sst(text));
  };
  const span = (from: string, to: string, row: number) => merges.push(`${from}${row}:${to}${row}`);

  put("B37", "เกณฑ์การประเมินความมีนัยสำคัญ Scope 3 (ตาราง G อ้างอิง Report TGO Workshop หน้า 34)");
  span("B", "O", 37);

  put("B38", "ประเด็นที่ต้องพิจารณา (น้ำหนัก %)");
  CRITERIA_BAND_COLS.forEach(([a, b], i) => {
    put(`${a}38`, `ระดับ ${i + 1}`);
    span(a, b, 38);
  });

  let row = 39;
  for (const c of table.criteria) {
    if (c.weight !== null) {
      put(`B${row}`, `${c.name} (${c.weight}%) — ${c.basis}`);
      CRITERIA_BAND_COLS.forEach(([a, b], i) => {
        put(`${a}${row}`, c.bands[i] || "");
        span(a, b, row);
      });
    } else {
      put(`B${row}`, c.basis ? `${c.name} — ${c.basis}` : c.name);
      put(`C${row}`, c.rule || "");
      span("C", "O", row);
    }
    row++;
  }

  put(`B${row}`, table.thresholdNote);
  span("B", "O", row);
  row++;
  for (const note of table.sourceNotes) {
    if (row > 59) break;
    put(`B${row}`, `หมายเหตุ: ${note}`);
    span("B", "O", row);
    row++;
  }

  return addMergeCells(sx, merges);
}

// Set a string cell in sheet XML to point to a shared string index,
// keeping the existing style attribute (s="...") intact.
// If the cell doesn't exist in the row, insert it.
function setCellSharedString(sheetXml: string, addr: string, sstIndex: number): string {
  const colMatch = addr.match(/^([A-Z]+)(\d+)$/);
  if (!colMatch) return sheetXml;
  const col = colMatch[1];
  const rowNum = colMatch[2];

  // Check if cell exists
  const existsRe = new RegExp(`<c r="${addr}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existsMatch = existsRe.exec(sheetXml);

  if (existsMatch) {
    // Cell exists – replace its content, keeping style, changing to t="s"
    const attrs = existsMatch[1];
    const styleMatch = attrs.match(/s="(\d+)"/);
    const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
    const newCell = `<c r="${addr}"${style} t="s"><v>${sstIndex}</v></c>`;
    return sheetXml.replace(existsMatch[0], newCell);
  } else {
    // Cell doesn't exist – insert into the correct row
    const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*?>)([\\s\\S]*?)(<\\/row>)`);
    const rowMatch = rowRe.exec(sheetXml);
    if (!rowMatch) return sheetXml;
    const rowContent = rowMatch[2];
    const newCell = `<c r="${addr}" t="s"><v>${sstIndex}</v></c>`;
    // Insert in column order
    const cells = [...rowContent.matchAll(/<c r="([A-Z]+)\d+"[^>]*>/g)];
    let inserted = false;
    let newRow = rowContent;
    for (const cm of cells) {
      const existingCol = cm[1];
      if (colCompare(col, existingCol) < 0) {
        newRow = rowContent.replace(cm[0], newCell + cm[0]);
        inserted = true;
        break;
      }
    }
    if (!inserted) newRow = rowContent + newCell;
    return sheetXml.replace(rowMatch[0], rowMatch[1] + newRow + rowMatch[3]);
  }
}

// Remove the value of a cell (keeps the cell and its style)
function clearCell(sheetXml: string, addr: string): string {
  return sheetXml.replace(new RegExp(`<c r="${addr}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`), (_m, attrs: string) => {
    const style = attrs.match(/\bs="\d+"/);
    return `<c r="${addr}"${style ? " " + style[0] : ""}/>`;
  });
}

// Set a numeric cell value in sheet XML, keeping existing style
function setCellNumber(sheetXml: string, addr: string, value: number): string {
  const colMatch = addr.match(/^([A-Z]+)(\d+)$/);
  if (!colMatch) return sheetXml;
  const col = colMatch[1];
  const rowNum = colMatch[2];

  const existsRe = new RegExp(`<c r="${addr}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existsMatch = existsRe.exec(sheetXml);

  if (existsMatch) {
    const attrs = existsMatch[1];
    const styleMatch = attrs.match(/s="(\d+)"/);
    const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
    const newCell = `<c r="${addr}"${style}><v>${value}</v></c>`;
    return sheetXml.replace(existsMatch[0], newCell);
  } else {
    const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*?>)([\\s\\S]*?)(<\\/row>)`);
    const rowMatch = rowRe.exec(sheetXml);
    if (!rowMatch) return sheetXml;
    const rowContent = rowMatch[2];
    const newCell = `<c r="${addr}"><v>${value}</v></c>`;
    const cells = [...rowContent.matchAll(/<c r="([A-Z]+)\d+"[^>]*>/g)];
    let inserted = false;
    let newRow = rowContent;
    for (const cm of cells) {
      if (colCompare(col, cm[1]) < 0) {
        newRow = rowContent.replace(cm[0], newCell + cm[0]);
        inserted = true;
        break;
      }
    }
    if (!inserted) newRow = rowContent + newCell;
    return sheetXml.replace(rowMatch[0], rowMatch[1] + newRow + rowMatch[3]);
  }
}

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function colCompare(a: string, b: string): number {
  return colToNum(a) - colToNum(b);
}

// Columns holding the Thai date (dd/mm/yyyy) that must be wide enough to show it
const DATE_COLUMNS: Array<{ sheet: string; col: string }> = [
  { sheet: "Fr-01",   col: "J" },
  { sheet: "Fr-02",   col: "M" },
  { sheet: "Fr-03.1", col: "M" },
  { sheet: "Fr-03.2", col: "P" },
  { sheet: "Fr-04.1", col: "AR" },
  { sheet: "Fr-04.2", col: "AR" },
  { sheet: "Fr-05",   col: "J" },
];
const DATE_COLUMN_MIN_WIDTH = 13;

// Value cells in the Fr-01 scope / info boxes: shrink text to fit the template's merged area
const FIT_TEXT_CELLS: Array<{ sheet: string; addr: string }> = [
  "H9", "H13", "H16", "H17", "H19",
  "G22", "G23", "G24", "G25", "G26", "G27", "G28",
].map((addr) => ({ sheet: "Fr-01", addr }));

interface StyleBook { xml: string; cache: Map<number, number> }

// Return a style index equal to `sid` but with shrinkToFit enabled (appended to cellXfs)
function shrinkCellStyle(book: StyleBook, sid: number): number {
  const cached = book.cache.get(sid);
  if (cached !== undefined) return cached;
  const block = book.xml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!block) return sid;
  const xfs = block[2].match(/<xf\b[^>]*?\/>|<xf\b[^>]*?>[\s\S]*?<\/xf>/g) || [];
  const xf = xfs[sid];
  if (!xf) return sid;

  const open = xf.match(/^<xf\b[^>]*?\/?>/)![0];
  const selfClosing = open.endsWith("/>");
  let newOpen = open.replace(/\/?>$/, "");
  if (!/\bapplyAlignment=/.test(newOpen)) newOpen += ' applyAlignment="1"';
  newOpen += ">";
  let body = selfClosing ? "" : xf.slice(open.length, xf.length - "</xf>".length);
  if (/<alignment\b/.test(body)) {
    body = body.replace(/<alignment\b([^>]*?)\/?>/, (_m, attrs: string) =>
      `<alignment${attrs.replace(/\s*\bshrinkToFit="[^"]*"/, "")} shrinkToFit="1"/>`);
  } else {
    body = `<alignment shrinkToFit="1"/>${body}`;
  }
  const newXf = `${newOpen}${body}</xf>`;

  const newIndex = xfs.length;
  book.xml = book.xml.replace(block[0], `<cellXfs count="${newIndex + 1}">${block[2]}${newXf}</cellXfs>`);
  book.cache.set(sid, newIndex);
  return newIndex;
}

function cellStyleId(sheetXml: string, addr: string): number | null {
  const m = sheetXml.match(new RegExp(`<c r="${addr}"([^>]*?)\\/?>`));
  if (!m) return null;
  const s = m[1].match(/\bs="(\d+)"/);
  return s ? Number(s[1]) : 0;
}

function setCellStyleId(sheetXml: string, addr: string, sid: number): string {
  return sheetXml.replace(new RegExp(`<c r="${addr}"([^>]*?)(\\/?)>`), (_m, attrs: string, slash: string) => {
    const updated = /\bs="\d+"/.test(attrs) ? attrs.replace(/\bs="\d+"/, `s="${sid}"`) : `${attrs} s="${sid}"`;
    return `<c r="${addr}"${updated}${slash}>`;
  });
}

// Make column `colNum` (1-based) at least `minWidth` wide, splitting <col> ranges as needed
function widenColumn(sheetXml: string, colNum: number, minWidth: number): string {
  const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
  const setAttr = (attrs: string, name: string, value: string) =>
    new RegExp(`\\b${name}="`).test(attrs)
      ? attrs.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${value}"`)
      : `${attrs} ${name}="${value}"`;

  type ColRange = { min: number; max: number; attrs: string };
  const block = sheetXml.match(/<cols>([\s\S]*?)<\/cols>/);
  const tags = block ? block[1].match(/<col [^>]*\/>/g) || [] : [];
  const ranges: ColRange[] = tags.map((t) => ({
    min: Number(attr(t, "min")),
    max: Number(attr(t, "max")),
    attrs: t.replace(/^<col\s+/, "").replace(/\/>$/, "").replace(/\s*\b(min|max)="\d+"/g, "").trim(),
  }));

  const target = ranges.find((r) => r.min <= colNum && colNum <= r.max);
  if (!target) {
    ranges.push({ min: colNum, max: colNum, attrs: `width="${minWidth}" customWidth="1"` });
  } else {
    const current = Number(attr(target.attrs, "width") ?? 8.43);
    const width = Math.max(current, minWidth);
    const pieces: ColRange[] = [];
    if (target.min < colNum) pieces.push({ min: target.min, max: colNum - 1, attrs: target.attrs });
    pieces.push({ min: colNum, max: colNum, attrs: setAttr(target.attrs, "customWidth", "1").replace(/\bwidth="[^"]*"/, `width="${width}"`) });
    if (colNum < target.max) pieces.push({ min: colNum + 1, max: target.max, attrs: target.attrs });
    ranges.splice(ranges.indexOf(target), 1, ...pieces);
  }
  ranges.sort((a, b) => a.min - b.min);
  const xml = `<cols>${ranges.map((r) => `<col min="${r.min}" max="${r.max}" ${r.attrs}/>`).join("")}</cols>`;
  return block
    ? sheetXml.replace(block[0], xml)
    : sheetXml.replace("<sheetData", `${xml}<sheetData`);
}

// Which "ที่มา" column to tick for an EF source (R Self collect, U TGO EF, W International DB)
function sourceTickColumn(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("tgo")) return "U";
  if (s.includes("verification") || s.includes("site") || s.includes("mass balance")) return "R";
  return "W";
}

export async function createVerificationWorkbook(state: AppData): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Template not found");
  const templateBuf = await response.arrayBuffer();

  const zip = await JSZip.loadAsync(templateBuf);

  if (state.company.companyLogo) {
    await embedPicture(zip, PICTURE_TARGETS.logo, state.company.companyLogo);
  }
  if (state.company.companyImage) {
    await embedPicture(zip, PICTURE_TARGETS.companyImage, state.company.companyImage);
  }
  if (state.company.organizationChart) {
    await embedPicture(zip, PICTURE_TARGETS.orgChart, state.company.organizationChart);
  }

  // Bar charts of tCO2e per scope: current year and base year (base year falls back to current year)
  const scopeBars = (acts: ActivityRecord[]) => [
    { label: "Scope 1", value: acts.filter((a) => (a.scope as string) === "scope1").reduce((s, a) => s + a.co2e, 0) / 1000 },
    { label: "Scope 2", value: acts.filter((a) => (a.scope as string) === "scope2").reduce((s, a) => s + a.co2e, 0) / 1000 },
    { label: "Scope 3", value: acts.filter((a) => (a.scope as string) === "scope3").reduce((s, a) => s + a.co2e, 0) / 1000 },
  ];
  const reportYear = Number(state.company.reportingYear);
  const yearOf = (a: ActivityRecord) => new Date(a.date).getFullYear();
  const currentAll = state.activities.filter((a) => periodOf(a) === "current");
  const baseActs = state.activities.filter((a) => periodOf(a) === "base");
  const currentActs = Number.isFinite(reportYear) ? currentAll.filter((a) => yearOf(a) === reportYear) : currentAll;
  const currentChart = await renderBarChartPng(`tCO2e ตาม Scope (${Number.isFinite(reportYear) ? reportYear : "ปีปัจจุบัน"})`, scopeBars(currentActs));
  // Fr-05 F22:J32: current vs base year per scope.
  // Base values come from the activities entered for the base period (tCO2e).
  const baseScopes = scopeBars(baseActs);
  const currentScopes = scopeBars(currentActs);
  const baseChart = await renderCompareChartPng(
    `เปรียบเทียบ tCO2e ต่อ Scope: ปีปัจจุบัน vs ปีฐาน${Number.isFinite(reportYear) ? ` (${reportYear} vs ${reportYear - 1})` : ""}`,
    [
      { label: "Scope 1", current: currentScopes[0].value, base: baseScopes[0].value },
      { label: "Scope 2", current: currentScopes[1].value, base: baseScopes[1].value },
      { label: "Scope 3", current: currentScopes[2].value, base: baseScopes[2].value },
    ],
  );
  await embedPicture(zip, { sheet: "xl/worksheets/sheet1.xml", drawing: "xl/drawings/drawing1.xml", media: "xl/media/chart_fr01_current.png", name: "Chart Current Year", box: { firstCol: 5, lastCol: 9, firstRow: 31, lastRow: 44 } }, currentChart);
  await embedPicture(zip, { sheet: "xl/worksheets/sheet7.xml", drawing: "xl/drawings/drawing4.xml", media: "xl/media/chart_fr05_current.png", name: "Chart Current Year", box: { firstCol: 5, lastCol: 9, firstRow: 5, lastRow: 14 } }, currentChart);
  await embedPicture(zip, { sheet: "xl/worksheets/sheet7.xml", drawing: "xl/drawings/drawing4.xml", media: "xl/media/chart_fr05_base.png", name: "Chart Base Year", box: { firstCol: 5, lastCol: 9, firstRow: 21, lastRow: 31 } }, baseChart);


  // Build patch field values
  const fields: PatchFields = {
    emissionUnit: "tCO2e",
    company:  state.company.companyName || state.company.companyNameThai || "",
    preparer: state.company.preparedBy || "",
    documentName: (state.company.documentName || "").trim(),
    documentVersion: (state.company.documentVersion || "").trim(),
    documentDate: formatThaiDate(new Date()),
    dataPeriod: (state.company.dataPeriod || "").trim(),
    basePeriod: (state.company.basePeriod || "").trim(),
    scope1Boundary: (state.company.scope1Boundary || "").trim(),
    scope2Boundary: (state.company.scope2Boundary || "").trim(),
    scope3Boundary: (state.company.scope3Boundary || "").trim(),
    contactLocation: (state.company.contactLocation || "").trim(),
    registrationDate: formatIsoDateThai((state.company.registrationDate || "").trim()),
    ...orgInfoFields(state.company.organizationInfo),
  };

  // Load shared strings once
  let sstXml = await zip.file("xl/sharedStrings.xml")!.async("string");

  // Build a string→index cache to avoid duplicating SST entries
  const sstValues = parseSSTValues(sstXml);
  const sstCache = new Map<string, number>(sstValues.map((v, i) => [v, i]));

  // Helper: get or add a shared string, return index
  function getOrAddSST(value: string): number {
    if (sstCache.has(value)) return sstCache.get(value)!;
    const result = addSharedString(sstXml, value);
    sstXml = result.xml;
    sstCache.set(value, result.index);
    return result.index;
  }

  // Load all sheet XMLs that we need to modify
  const sheetXmls: Record<string, string> = {};
  const neededSheets = new Set([
    ...TARGETS.map(t => t.sheet),
    "Fr-04.1",
  ]);
  for (const sheetName of neededSheets) {
    const file = SHEET_FILES[sheetName];
    if (file && zip.file(file)) {
      sheetXmls[sheetName] = await zip.file(file)!.async("string");
    }
  }

  // Fr-01 totals (tCO2e): H18 = current year total, H20 = base year total (from base-period activities)
  const currentTotalT = currentActs.reduce((s, a) => s + a.co2e, 0) / 1000;
  const baseTotalT = baseYearTotalsT(baseActs).total;
  if (sheetXmls["Fr-01"]) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    sheetXmls["Fr-01"] = setCellNumber(sheetXmls["Fr-01"], "H18", round2(currentTotalT));
    sheetXmls["Fr-01"] = setCellNumber(sheetXmls["Fr-01"], "H20", round2(baseTotalT));
  }

  // Apply fixed field patches
  for (const target of TARGETS) {
    const value = fields[target.field];
    if (!value || !sheetXmls[target.sheet]) continue;
    const idx = getOrAddSST(value);
    sheetXmls[target.sheet] = setCellSharedString(sheetXmls[target.sheet], target.addr, idx);
  }

  // Layout: date columns wide enough for dd/mm/yyyy, and scope/info values shrink to fit their boxes
  const styleBook: StyleBook = {
    xml: await zip.file("xl/styles.xml")!.async("string"),
    cache: new Map(),
  };
  for (const d of DATE_COLUMNS) {
    if (sheetXmls[d.sheet]) {
      sheetXmls[d.sheet] = widenColumn(sheetXmls[d.sheet], colToNum(d.col), DATE_COLUMN_MIN_WIDTH);
    }
  }
  for (const f of FIT_TEXT_CELLS) {
    const sx = sheetXmls[f.sheet];
    if (!sx) continue;
    const sid = cellStyleId(sx, f.addr);
    if (sid === null) continue;
    sheetXmls[f.sheet] = setCellStyleId(sx, f.addr, shrinkCellStyle(styleBook, sid));
  }
  zip.file("xl/styles.xml", styleBook.xml);

  // Fill one account-list sheet (Fr-04.1 = ปีปัจจุบัน, Fr-04.2 = ปีฐาน) from the given activities.
  // Scope 1 rows 11–23 (row 24 is the sub-total bar): B = description, C = unit, D = quantity,
  //   E–N = EF inputs, R–W = source tick, Z = reference.
  // Scope 2 rows 32–34 and Scope 3 rows 37–42 (inside merged E:P blocks, so EF goes into column Q):
  //   B/C/D as above, Q = total EF per unit (kgCO2e), R–W tick, Z reference.
  const fillActivitySheet = (input: string, acts: ActivityRecord[]): string => {
    let sx = input;
    const scope1Start = 11;
    const scope1End = 23;
    const scope2Excel = [32, 33, 34];
    const scope3Excel = [37, 38, 39, 40, 41, 42];

    // Aggregate activities by scope/factor/description/unit
    type AggVal = ActivityRow & { scope: string };
    const agg = new Map<string, AggVal>();
    for (const a of acts) {
      const scope = a.scope as string;
      const desc = a.description || a.subCategory || "";
      const unit = a.unit || "";
      const factorId = a.factorId || "";
      const key = `${scope}|${factorId}|${desc}|${unit}`;
      const existing = agg.get(key) ?? { scope, factorId, description: desc, unit, quantity: 0 };
      existing.quantity += Number(a.activityData) || 0;
      agg.set(key, existing);
    }

    const scope1Rows = [...agg.values()].filter(v => v.scope === "scope1").slice(0, scope1End - scope1Start + 1);
    const scope2Rows = [...agg.values()].filter(v => v.scope === "scope2").slice(0, scope2Excel.length);
    const scope3Rows = [...agg.values()].filter(v => v.scope === "scope3").slice(0, scope3Excel.length);

    const { rows: scope1Efs, gwp: scope1Gwp } = getScope1EfData();

    // Clear the sample rows left in the template so only the company's activities are shown
    const scope1ExcelRows = Array.from({ length: scope1End - scope1Start + 1 }, (_, i) => scope1Start + i);
    for (const r of [...scope1ExcelRows, ...scope2Excel, ...scope3Excel]) {
      for (const col of ["B", "C", "D"]) sx = clearCell(sx, `${col}${r}`);
    }
    for (const r of scope1ExcelRows) {
      for (const col of ["E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "R", "S", "T", "U", "V", "W", "Z"]) {
        sx = clearCell(sx, `${col}${r}`);
      }
    }
    for (const r of [...scope2Excel, ...scope3Excel]) {
      for (const col of ["Q", "R", "S", "T", "U", "V", "W", "Z"]) sx = clearCell(sx, `${col}${r}`);
    }

    // GWP100 table used by the template formulas (AV8:AV13) follows the app's GWP values
    sx = setCellNumber(sx, "AV8", scope1Gwp.co2);
    sx = setCellNumber(sx, "AV9", scope1Gwp.fossilCh4);
    sx = setCellNumber(sx, "AV10", scope1Gwp.ch4);
    sx = setCellNumber(sx, "AV11", scope1Gwp.n2o);
    sx = setCellNumber(sx, "AV12", scope1Gwp.sf6);
    sx = setCellNumber(sx, "AV13", scope1Gwp.nf3);

    // Scope 1 rows
    scope1Rows.forEach((row, i) => {
      const excelRow = scope1Start + i;
      if (row.description) sx = setCellSharedString(sx, `B${excelRow}`, getOrAddSST(row.description));
      if (row.unit) sx = setCellSharedString(sx, `C${excelRow}`, getOrAddSST(row.unit));
      sx = setCellNumber(sx, `D${excelRow}`, row.quantity);

      // EF inputs from EF Components (raw gas amounts per unit; the template formulas apply GWP)
      const ef = scope1Efs.find((r) => r.id === row.factorId);
      if (ef) {
        const inputs: Array<[string, number]> = [
          ["E", ef.co2], ["G", ef.ch4], ["H", ef.n2o], ["I", ef.sf6],
          ["K", ef.hfc], ["L", ef.pfc], ["M", ef.hfcGwp], ["N", ef.pfcGwp],
        ];
        for (const [col, value] of inputs) {
          if (value) sx = setCellNumber(sx, `${col}${excelRow}`, value);
        }
        // Tick the source column, and write the reference
        sx = setCellSharedString(sx, `${sourceTickColumn(ef.source)}${excelRow}`, getOrAddSST("✓"));
        sx = setCellSharedString(sx, `Z${excelRow}`, getOrAddSST(`${ef.id} – ${ef.source}`));
      }
    });

    // Scope 2 / Scope 3 rows: total EF per unit goes into Q (template AO = D × Q / 1000 gives tCO2e)
    const writeTotalEfRow = (row: ActivityRow, excelRow: number) => {
      if (row.description) sx = setCellSharedString(sx, `B${excelRow}`, getOrAddSST(row.description));
      if (row.unit) sx = setCellSharedString(sx, `C${excelRow}`, getOrAddSST(row.unit));
      sx = setCellNumber(sx, `D${excelRow}`, row.quantity);
      const f = findFactor(row.factorId);
      if (f) {
        sx = setCellNumber(sx, `Q${excelRow}`, f.factor);
        const source = f.source || "";
        sx = setCellSharedString(sx, `${sourceTickColumn(source)}${excelRow}`, getOrAddSST("✓"));
        sx = setCellSharedString(sx, `Z${excelRow}`, getOrAddSST(`${f.id} – ${source}`));
      }
    };
    scope2Rows.forEach((row, i) => writeTotalEfRow(row, scope2Excel[i]));
    scope3Rows.forEach((row, i) => writeTotalEfRow(row, scope3Excel[i]));

    return sx;
  };

  if (sheetXmls["Fr-04.1"]) {
    sheetXmls["Fr-04.1"] = fillActivitySheet(sheetXmls["Fr-04.1"], currentAll);
  }
  if (sheetXmls["Fr-04.2"]) {
    sheetXmls["Fr-04.2"] = fillActivitySheet(sheetXmls["Fr-04.2"], baseActs);
  }

  // Fr-03.2: significance scores per Scope 3 category (template rows 19–33, No. 1–15)
  // D = Magnitude, E = Level of influence, F = Risk/Opportunity (F:G merged, anchor F), O = remark (O:P merged)
  if (sheetXmls["Fr-03.2"]) {
    let sx = sheetXmls["Fr-03.2"];
    buildScope3Rows(state.company, state.activities).forEach((r, i) => {
      const excelRow = 19 + i;
      sx = setCellNumber(sx, `D${excelRow}`, r.magnitude);
      sx = setCellNumber(sx, `E${excelRow}`, r.influence);
      sx = setCellNumber(sx, `F${excelRow}`, r.riskOpportunity);
      const verdict = `รวม ${r.total.toFixed(2)} — ${r.significant ? "มีนัยสำคัญ" : "ไม่มีนัยสำคัญ"}`;
      const remark = r.remark ? `${verdict} · ${r.remark}` : verdict;
      sx = setCellSharedString(sx, `O${excelRow}`, getOrAddSST(remark));
    });
    // Significance criteria block (ตาราง G) in B37:O59
    sx = writeScope3CriteriaBlock(sx, getOrAddSST);
    sheetXmls["Fr-03.2"] = sx;
  }

  // Write modified XMLs back into the zip (preserve everything else untouched)
  for (const [sheetName, xml] of Object.entries(sheetXmls)) {
    const file = SHEET_FILES[sheetName];
    if (file) zip.file(file, xml);
  }
  zip.file("xl/sharedStrings.xml", sstXml);

  // Make Excel recalculate the template formulas (Total, GHG tonnes, shares) when the file opens
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  zip.file(
    "xl/workbook.xml",
    wbXml.replace(/<calcPr([^>]*?)\/>/, (m, attrs: string) =>
      /fullCalcOnLoad/.test(attrs) ? m : `<calcPr${attrs} fullCalcOnLoad="1"/>`),
  );

  // Generate final blob
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return blob;
}

export async function downloadVerificationSheet(state: AppData): Promise<void> {
  const blob = await createVerificationWorkbook(state);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const name = state.company.companyName || "CFO";
  const date = new Date().toISOString().slice(0, 10);
  link.download = `Verification_Sheet_${name}_${date}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
