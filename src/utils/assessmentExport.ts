import type { ActivityRecord, CompanyProfile } from "../types";
import { buildScope3Rows } from "./scope3Significance";
import { buildUncertaintyItems, SCOPE_LABEL, type UncertaintyScore } from "../data/uncertainty";
import { csvEscape, downloadText } from "./csv";

function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

// ตารางประเมินนัยสำคัญ Scope 3 (Fr-03.2) ตามที่แสดงในหน้า Scope 3 Significance
export function buildSignificanceCsv(company: CompanyProfile, activities: ActivityRecord[]): string {
  const rows = buildScope3Rows(company, activities);
  return toCsv(
    ["No", "ประเภทย่อย (Category)", "tCO2e", "สัดส่วน %", "Magnitude", "Level of influence", "Risk / Opportunity", "คะแนนรวม", "ผล", "หมายเหตุ"],
    rows.map((r) => [
      r.no,
      r.name,
      r.tCO2e.toFixed(2),
      r.sharePct.toFixed(1),
      r.magnitude,
      r.influence,
      r.riskOpportunity,
      r.total.toFixed(2),
      r.significant ? "มีนัยสำคัญ" : "ไม่มีนัยสำคัญ",
      r.remark,
    ]),
  );
}

// ตารางประเมินความไม่แน่นอน (หน้า 31 ของ TGO) ตามรายการจริงของปีที่เลือก
export function buildUncertaintyCsv(
  activities: ActivityRecord[],
  company: CompanyProfile,
  factors: { id: string; name: string }[],
  year: number,
  scores: Record<string, UncertaintyScore>,
): string {
  const items = buildUncertaintyItems(activities, company, factors, year, scores);
  return toCsv(
    ["ประเภท (ขอบเขต)", "หมวดย่อย", "รายการ", "รายละเอียด", "หมายเหตุ", "จำนวนเดือน", "A (ข้อมูลกิจกรรม)", "B (ค่า EF)", "A×B", "ระดับคุณภาพ", "คำอธิบาย"],
    items.map((i) => [
      SCOPE_LABEL[i.scope] || i.scope,
      i.subCategory,
      i.factorName,
      i.description,
      i.note,
      i.months,
      i.activityScore,
      i.efScore,
      i.score,
      i.level ? `ระดับ ${i.level.level}` : "-",
      i.level ? `${i.level.description} · ${i.level.quality}` : "-",
    ]),
  );
}

export function downloadSignificanceCsv(company: CompanyProfile, activities: ActivityRecord[]) {
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`scope3_significance_${date}.csv`, buildSignificanceCsv(company, activities));
}

export function downloadUncertaintyCsv(
  activities: ActivityRecord[],
  company: CompanyProfile,
  factors: { id: string; name: string }[],
  year: number,
  scores: Record<string, UncertaintyScore>,
) {
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`uncertainty_${year}_${date}.csv`, buildUncertaintyCsv(activities, company, factors, year, scores));
}
