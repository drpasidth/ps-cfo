// การประเมินความไม่แน่นอน (Uncertainty) อ้างอิง "Report TGO Workshop.pdf" หน้า 30–31
// คะแนนรวม = คะแนนข้อมูลกิจกรรม (A) × คะแนนค่า EF (B) แล้วจับคู่กับระดับในตารางเกณฑ์
import { useSyncExternalStore } from "react";
import { tenantStorage } from "./tenantStorage";
import { yearOf, type ActivityRecord, type CompanyProfile } from "../types";

// ข้อมูลกิจกรรม (A)
export const ACTIVITY_OPTIONS = [
  { value: 6, label: "X = 6 คะแนน: เก็บข้อมูลอย่างต่อเนื่อง" },
  { value: 3, label: "Y = 3 คะแนน: เก็บข้อมูลจากมิเตอร์และใบเสร็จ" },
  { value: 1, label: "Z = 1 คะแนน: เก็บข้อมูลจากการประมาณค่า" },
] as const;

// ค่า EF (B)
export const EF_OPTIONS = [
  { value: 4, label: "C = 4 คะแนน: EF จากการวัดที่มีคุณภาพ" },
  { value: 3, label: "D = 3 คะแนน: EF จากผู้ผลิต หรือ EF ระดับประเทศ" },
  { value: 2, label: "E = 2 คะแนน: EF ระดับภูมิภาค" },
  { value: 1, label: "F = 1 คะแนน: EF ระดับสากล" },
] as const;

export interface UncertaintyLevel {
  level: 1 | 2 | 3 | 4;
  min: number;
  max: number;
  description: string;
  quality: string;
}

// ตารางกำหนดระดับคะแนนและเกณฑ์ (หน้า 30)
export const UNCERTAINTY_LEVELS: UncertaintyLevel[] = [
  { level: 1, min: 1, max: 6, description: "มีความไม่แน่นอนสูง", quality: "คุณภาพของข้อมูลไม่ดี" },
  { level: 2, min: 7, max: 12, description: "มีความไม่แน่นอนเล็กน้อย", quality: "คุณภาพของข้อมูลปานกลาง" },
  { level: 3, min: 13, max: 18, description: "มีความไม่แน่นอนต่ำ", quality: "คุณภาพของข้อมูลดี" },
  { level: 4, min: 19, max: 24, description: "มีความไม่แน่นอนต่ำ", quality: "คุณภาพของข้อมูลดีเยี่ยม" },
];

export function levelFromScore(score: number): UncertaintyLevel | null {
  return UNCERTAINTY_LEVELS.find((l) => score >= l.min && score <= l.max) ?? null;
}

// คะแนนที่ผู้ใช้เลือกให้แต่ละรายการจริง
export interface UncertaintyScore {
  activityScore: number; // A
  efScore: number; // B
}

// ค่าตั้งต้นเมื่อยังไม่เคยให้คะแนน: A = 3 (มิเตอร์/ใบเสร็จ), B = 3 (EF ระดับประเทศ/ผู้ผลิต)
export const DEFAULT_SCORE: UncertaintyScore = { activityScore: 3, efScore: 3 };

// กลุ่มรายการจริง: ใช้คีย์เดียวกับหน้า Scope 1/2/3 (factor + รายละเอียด + หมายเหตุ)
export function activityGroupKey(a: Pick<ActivityRecord, "scope" | "subCategory" | "factorId" | "description" | "note">): string {
  return [a.scope, a.subCategory, a.factorId, a.description || "", a.note || ""].join("|");
}

export const SCOPE_LABEL: Record<string, string> = {
  scope1: "ขอบเขต 1",
  scope2: "ขอบเขต 2",
  scope3: "ขอบเขต 3",
};

export interface UncertaintyItem {
  key: string;
  scope: string;
  subCategory: string;
  factorName: string;
  description: string;
  note: string;
  months: number;
  activityScore: number;
  efScore: number;
  score: number; // A×B
  level: UncertaintyLevel | null;
}

// รายการจริงของปีที่เลือก รวมกลุ่มเดียวกับหน้า Scope 1/2/3 พร้อมคะแนนที่บันทึกไว้
export function buildUncertaintyItems(
  activities: ActivityRecord[],
  company: CompanyProfile,
  factors: { id: string; name: string }[],
  year: number,
  scores: Record<string, UncertaintyScore>,
): UncertaintyItem[] {
  const periodActivities = activities.filter((a) => yearOf(a, company) === year);
  const groups = new Map<string, { first: ActivityRecord; months: Set<string>; count: number }>();
  for (const a of periodActivities) {
    const key = activityGroupKey(a);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (a.month) g.months.add(a.month);
    } else {
      groups.set(key, { first: a, months: new Set(a.month ? [a.month] : []), count: 1 });
    }
  }
  return Array.from(groups.entries())
    .map(([key, g]) => {
      const factor = factors.find((f) => f.id === g.first.factorId);
      const s = scores[key] ?? DEFAULT_SCORE;
      const score = s.activityScore * s.efScore;
      return {
        key,
        scope: g.first.scope,
        subCategory: g.first.subCategory,
        factorName: factor?.name || g.first.factorId,
        description: g.first.description || "",
        note: g.first.note || "",
        months: g.months.size || g.count,
        activityScore: s.activityScore,
        efScore: s.efScore,
        score,
        level: levelFromScore(score),
      };
    })
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.subCategory.localeCompare(b.subCategory));
}

const KEY = "cfo_saas_uncertainty_scores";
const listeners = new Set<() => void>();
let cache: Record<string, UncertaintyScore> | null = null;

function load(): Record<string, UncertaintyScore> {
  try {
    const raw = tenantStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, UncertaintyScore>;
    }
  } catch {
    /* ignore invalid saved data */
  }
  return {};
}

export function getUncertaintyScores(): Record<string, UncertaintyScore> {
  if (!cache) cache = load();
  return cache;
}

function notify() {
  listeners.forEach((l) => l());
}

export function setUncertaintyScore(key: string, patch: Partial<UncertaintyScore>) {
  const current = getUncertaintyScores();
  const next = { ...current, [key]: { ...(current[key] ?? DEFAULT_SCORE), ...patch } };
  cache = next;
  tenantStorage.setItem(KEY, JSON.stringify(next));
  notify();
}

// บันทึกทั้งชุดพร้อมกัน (ใช้กับปุ่มบันทึกในหน้า)
export function saveUncertaintyScores(next: Record<string, UncertaintyScore>) {
  cache = next;
  tenantStorage.setItem(KEY, JSON.stringify(next));
  notify();
}

export function clearUncertaintyScores() {
  tenantStorage.removeItem(KEY);
  cache = {};
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUncertaintyScores(): Record<string, UncertaintyScore> {
  return useSyncExternalStore(subscribe, getUncertaintyScores, getUncertaintyScores);
}
