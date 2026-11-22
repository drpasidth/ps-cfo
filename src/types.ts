export type Scope = "scope1" | "scope2" | "scope3";
export type SubCategory =
  | "stationary"
  | "mobile"
  | "fugitive"
  | "electricity"
  | "purchased_goods"
  | "capital_goods"
  | "fuel_energy"
  | "upstream_transport"
  | "waste"
  | "business_travel"
  | "commuting"
  | "upstream_leased"
  | "downstream_transport"
  | "processing_sold"
  | "use_sold"
  | "end_of_life"
  | "downstream_leased"
  | "franchises"
  | "investments"
  | "water";

// ประเภทของปีที่กรอกข้อมูล: ปีปัจจุบัน (current), ปีฐาน (base), หรือปีอื่นที่กรอกย้อนหลัง (other)
// Records without a period are current.
export type Period = "current" | "base" | "other";
export function periodOf(a: { period?: Period }): Period {
  if (a.period === "base") return "base";
  if (a.period === "other") return "other";
  return "current";
}

// ปีของรายการ: ใช้ฟิลด์ year ถ้ามี (รายการใหม่), ไม่เช่นนั้นอ้างจาก period (รายการเก่า)
export function yearOf(
  a: { year?: number; period?: Period },
  company: { reportingYear: string; basePeriodYear?: number },
): number {
  if (a.year) return a.year;
  if (a.period === "base" && company.basePeriodYear) return company.basePeriodYear;
  return Number(company.reportingYear) || new Date().getFullYear();
}

// กำหนดฟิลด์ year ให้ทุกรายการอย่างถาวร (รายการเก่าที่ไม่มี year จะถูกผูกกับปีของ company เดิม)
// ทำก่อนเปลี่ยนปีฐาน/ปีที่รายงาน เพื่อไม่ให้รายการเก่าย้ายปีตามค่าใหม่
export function assignActivityYears<T extends { year?: number; period?: Period }>(
  activities: T[],
  company: { reportingYear: string; basePeriodYear?: number },
  nextCompany: { reportingYear: string; basePeriodYear?: number } = company,
): T[] {
  return activities.map((a) => {
    const year = yearOf(a, company);
    return { ...a, year, period: periodForYear(year, nextCompany) };
  });
}

// ประเภทของปีที่เลือก เทียบกับปีที่รายงานและปีฐาน
export function periodForYear(
  year: number,
  company: { reportingYear: string; basePeriodYear?: number },
): Period {
  if (year === (Number(company.reportingYear) || new Date().getFullYear())) return "current";
  if (company.basePeriodYear && year === company.basePeriodYear) return "base";
  return "other";
}

export const ASSURANCE_LEVELS = [
  "แบบจำกัด / Limited Assurance",
  "แบบสมเหตุสมผล / Reasonable Assurance",
  "ไม่มีการรับรอง / None",
];

export const BOUNDARY_APPROACHES = [
  "การควบคุมการดำเนินงาน (Operational Control)",
  "การควบคุมทางการเงิน (Financial Control)",
  "ส่วนแบ่งทุน (Equity Share)",
];

export interface CompanyProfile {
  companyName: string;
  companyNameThai?: string;
  address: string;
  taxId?: string;
  industry?: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  reportingYear: string;
  reportingPeriodFrom: string;
  reportingPeriodTo: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  documentName?: string;
  documentVersion?: string;
  dataPeriod?: string; // ปีที่เก็บข้อมูล เช่น ม.ค. 69 - ธ.ค. 69
  basePeriod?: string; // ปีฐาน เช่น ม.ค. 68 - ธ.ค. 68 (สร้างจาก basePeriodYear)
  basePeriodYear?: number; // ปีฐาน ค.ศ. ที่ admin เลือก (ปีใดก็ได้ ต่างจากปีที่รายงาน)
  scope1Boundary?: string; // ขอบเขตขององค์กร Scope 1
  scope2Boundary?: string; // ขอบเขตขององค์กร Scope 2
  scope3Boundary?: string; // ขอบเขตขององค์กร Scope 3
  contactLocation?: string; // สถานที่ติดต่อ
  registrationDate?: string; // วันที่ขอขึ้นทะเบียน (YYYY-MM-DD)
  organizationInfo?: string; // ข้อมูลองค์กร (หลายบรรทัด แยกด้วยการขึ้นบรรทัดใหม่)
  companyImage?: string;
  companyLogo?: string;
  organizationChart?: string;
  processFlowDiagram?: string; // รูปแผนผังกระบวนการผลิต (data URL)
  trackingMethodology?: string; // 2.7 แนวทางที่ใช้ในการติดตามผล
  assuranceLevel?: string; // 2.8 ระดับของการรับรอง (ค่าจาก ASSURANCE_LEVELS)
  materialityThreshold?: string; // 2.9 ระดับความมีสาระสำคัญ เช่น 5%
  boundaryApproach?: string; // 3.1.1 แนวทางที่ใช้กำหนดขอบเขต (ค่าจาก BOUNDARY_APPROACHES)
  boundaryCoverage?: string; // 3.1.2 พื้นที่/สถานที่ที่ครอบคลุมในรายงาน
  boundaryDocument?: string; // 3.1.3 เอกสารยืนยันขอบเขต เช่น เลขใบอนุญาตประกอบกิจการโรงงาน
  baseYearEmissions?: BaseYearEmissions; // ประวัติการปล่อยก๊าซปีฐาน (tCO2e)
  scope3Significance?: Record<string, Scope3Assessment>; // คะแนนความมีนัยสำคัญ Scope 3 รายประเภทย่อย (key = subCategory)
  qualityRoles?: QualityRole[]; // 7.1 โครงสร้างของระบบการจัดการคุณภาพของข้อมูล
  qualityDiagrams?: string[]; // 7.2 รูปแผนผังการจัดการคุณภาพของข้อมูล (data URL, ไม่จำกัดจำนวน)
  calibrationRecords?: CalibrationRecord[]; // 7.3 บันทึกการสอบเทียบวัดมาตรฐานของอุปกรณ์/เครื่องมือวัด
}

export interface QualityRole {
  role: string; // บทบาท เช่น ผู้จัดการข้อมูล
  name: string; // ชื่อ-สกุล
  position: string; // ตำแหน่ง
  duty: string; // หน้าที่
}

export interface CalibrationRecord {
  scope: string; // ขอบเขต/แหล่งปล่อยก๊าซเรือนกระจก (ประเภทที่ 1, 2, 3, รายงานแยก)
  equipment: string; // อุปกรณ์/เครื่องมือวัด (เครื่องที่)
  calibrator: string; // ผู้ทำการสอบเทียบ / แหล่งที่เทียบวัด
  accuracy: string; // ความแม่นยำที่ยอมรับได้หรือที่กำหนดไว้
  measuredError: string; // ค่าความผิดพลาดของอุปกรณ์/เครื่องมือวัดที่วัดได้
  reference: string; // เอกสารอ้างอิง
}

// คะแนนที่ผู้ใช้กรอกต่อประเภทย่อย Scope 3 (1 / 3 / 5); magnitude คำนวณจากข้อมูลอัตโนมัติ
export interface Scope3Assessment {
  influence: 1 | 3 | 5; // ระดับความสามารถในการติดตามและลด GHG
  riskOpportunity: 1 | 3 | 5; // ความเสี่ยงหรือโอกาส
  remark?: string;
}

export interface BaseYearEmissions {
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  other: number;
}

export interface ActivityAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface ActivityRecord {
  id: string;
  scope: Scope;
  subCategory: SubCategory;
  factorId: string;
  activityData: number; // quantity consumed
  unit: string;
  co2e: number; // calculated kgCO2e
  note?: string;
  description?: string;
  attachments?: ActivityAttachment[];
  month?: string;
  entryType?: "activity" | "purchase"; // purchase = รายการซื้อสินค้า (Scope 3 purchased goods)
  period?: Period; // ประเภทปีของรายการ (ไม่ระบุ = ปีปัจจุบัน)
  year?: number; // ปี ค.ศ. ที่รายการนี้เป็นของ (กรอกย้อนหลังได้)
  date: string;
}

export interface AppData {
  company: CompanyProfile;
  activities: ActivityRecord[];
}

export const DEFAULT_COMPANY: CompanyProfile = {
  companyName: "",
  companyNameThai: "",
  address: "",
  taxId: "",
  industry: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  reportingYear: new Date().getFullYear().toString(),
  reportingPeriodFrom: "",
  reportingPeriodTo: "",
  preparedBy: "",
  reviewedBy: "",
  approvedBy: "",
};
