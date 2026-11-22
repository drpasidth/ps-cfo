import type { ActivityRecord, CompanyProfile, Scope3Assessment, SubCategory } from "../types";
import { yearOf } from "../types";

// 15 ประเภทย่อย Scope 3 ตามลำดับแถวในชีท Fr-03.2 (แถว 19–33)
export const SCOPE3_CATEGORIES: { no: number; subCategory: SubCategory; name: string }[] = [
  { no: 1, subCategory: "purchased_goods", name: "Purchased goods and services" },
  { no: 2, subCategory: "capital_goods", name: "Capital goods" },
  { no: 3, subCategory: "fuel_energy", name: "Fuel- and energy related activities" },
  { no: 4, subCategory: "upstream_transport", name: "Upstream transportation and distribution" },
  { no: 5, subCategory: "waste", name: "Waste generated in operations" },
  { no: 6, subCategory: "business_travel", name: "Business travel" },
  { no: 7, subCategory: "commuting", name: "Employee commuting" },
  { no: 8, subCategory: "upstream_leased", name: "Upstream leased assets" },
  { no: 9, subCategory: "downstream_transport", name: "Downstream transportation and distribution" },
  { no: 10, subCategory: "processing_sold", name: "Processing of sold products" },
  { no: 11, subCategory: "use_sold", name: "Use of sold products" },
  { no: 12, subCategory: "end_of_life", name: "End-of-life treatment of sold products" },
  { no: 13, subCategory: "downstream_leased", name: "Downstream leased assets" },
  { no: 14, subCategory: "franchises", name: "Franchises" },
  { no: 15, subCategory: "investments", name: "Investments" },
];

// ค่าเริ่มต้นเมื่อยังไม่ได้กรอก (3 = ปานกลาง) ผู้ใช้ควรตรวจสอบก่อนส่งออก
export const DEFAULT_SCOPE3_ASSESSMENT: Scope3Assessment = { influence: 3, riskOpportunity: 3, remark: "" };

export const INFLUENCE_OPTIONS: { value: 1 | 3 | 5; label: string }[] = [
  { value: 5, label: "5 – มาก: มีเป้าหมายและแผนลดชัดเจน" },
  { value: 3, label: "3 – ปานกลาง: มีเป้าหมาย แต่ยังไม่มีแผน" },
  { value: 1, label: "1 – น้อย: ยังไม่มีเป้าหมายการลด" },
];

export const RISK_OPTIONS: { value: 1 | 3 | 5; label: string }[] = [
  { value: 5, label: "5 – มาก: มีความเสี่ยง/โอกาส และมีแนวทางลด" },
  { value: 3, label: "3 – ปานกลาง: มีความเสี่ยง/โอกาส แต่ยังไม่มีแนวทางลด" },
  { value: 1, label: "1 – น้อย: ไม่มีแนวทางลด" },
];

// Magnitude ตามตารางที่ 7 (TGO): สัดส่วนการปล่อย >40% = 5, 5–40% = 3, <5% = 1
export function magnitudeScore(sharePct: number): 1 | 3 | 5 {
  if (sharePct > 40) return 5;
  if (sharePct >= 5) return 3;
  return 1;
}

export interface Scope3Row {
  no: number;
  subCategory: SubCategory;
  name: string;
  tCO2e: number;
  sharePct: number;
  magnitude: 1 | 3 | 5;
  influence: 1 | 3 | 5;
  riskOpportunity: 1 | 3 | 5;
  remark: string;
  total: number; // น้ำหนัก: ปริมาณ 50% + ความสามารถในการลด 30% + ความเสี่ยง/โอกาส 20%
  significant: boolean; // total > 3
}

// คำนวณแถวของ Fr-03.2 จากรายการ Scope 3 ของปีที่รายงาน
export function buildScope3Rows(company: CompanyProfile, activities: ActivityRecord[]): Scope3Row[] {
  const reportingYear = Number(company.reportingYear) || new Date().getFullYear();
  const s3 = activities.filter((a) => a.scope === "scope3" && yearOf(a, company) === reportingYear);
  const totalKg = s3.reduce((sum, a) => sum + a.co2e, 0);
  const saved = company.scope3Significance || {};

  return SCOPE3_CATEGORIES.map((c) => {
    const kg = s3.filter((a) => a.subCategory === c.subCategory).reduce((sum, a) => sum + a.co2e, 0);
    const sharePct = totalKg > 0 ? (kg / totalKg) * 100 : 0;
    const magnitude = magnitudeScore(sharePct);
    const assessment = { ...DEFAULT_SCOPE3_ASSESSMENT, ...saved[c.subCategory] };
    const total = Math.round((0.5 * magnitude + 0.3 * assessment.influence + 0.2 * assessment.riskOpportunity) * 100) / 100;
    return {
      no: c.no,
      subCategory: c.subCategory,
      name: c.name,
      tCO2e: kg / 1000,
      sharePct,
      magnitude,
      influence: assessment.influence,
      riskOpportunity: assessment.riskOpportunity,
      remark: assessment.remark || "",
      total,
      significant: total > 3,
    };
  });
}
