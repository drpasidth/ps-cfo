// ตารางที่ G: หลักเกณฑ์การให้คะแนนการคัดเลือก Scope 3 (อ้างอิง "Report TGO Workshop.pdf" หน้า 34)
// แก้ไขได้ในหน้า "เกณฑ์คะแนน Scope 3 (ตาราง G)" บันทึกในฐานข้อมูลของบริษัท (tenantStorage) เหมือนตาราง CFP
import { useSyncExternalStore } from "react";
import { tenantStorage } from "./tenantStorage";

export interface Scope3Criterion {
  id: string;
  name: string; // ประเด็นที่ต้องพิจารณา
  basis: string; // ผลประเมิน / เกณฑ์วัด
  weight: number | null; // น้ำหนัก (%) ประเด็นที่ไม่ให้คะแนนเป็น null
  bands: [string, string, string, string, string]; // ระดับคะแนน 1..5
  rule?: string; // กฎเฉพาะ (ใช้แทนการให้คะแนน)
}

export interface Scope3CriteriaTable {
  criteria: Scope3Criterion[];
  threshold: number; // ผลการประเมิน ≥ threshold = มีนัยสำคัญ
  thresholdNote: string;
  sourceNotes: string[];
}

const SIZE_BANDS: Scope3Criterion["bands"] = ["<10%", "10%<GHG≥20%", "20%<GHG≥30%", "30%<GHG≥40%", ">40%"];
const INFLUENCE_BANDS: Scope3Criterion["bands"] = ["<10%", "10%<GHG≥20%", "20%<GHG≥30%", "30%<GHG≥40%", ">40%"];
const RISK_BANDS: Scope3Criterion["bands"] = ["<5%", "5%<GHG≥10%", "10%<GHG≥15%", "15%<GHG≥20%", ">20%"];
const OPPORTUNITY_BANDS: Scope3Criterion["bands"] = ["<5%", "5%<GHG≥10%", "10%<GHG≥15%", "15%<GHG≥40%", ">20%"];

export const DEFAULT_SCOPE3_CRITERIA: Scope3CriteriaTable = {
  criteria: [
    {
      id: "size",
      name: "Size",
      basis: "% GHG (เทียบ Scope 1+2+3)",
      weight: 60,
      bands: SIZE_BANDS,
    },
    {
      id: "influence",
      name: "Level of influence (Reduction of potential)",
      basis: "%การปล่อย GHG (เทียบภายใน CAT) ของแหล่งปล่อยที่มีศักยภาพที่สามารถลดการปล่อย GHG ได้",
      weight: 20,
      bands: INFLUENCE_BANDS,
    },
    {
      id: "risk",
      name: "Risk",
      basis: "%การปล่อย GHG (เทียบภายใน CAT) ของแหล่งปล่อยที่มีความเสี่ยง",
      weight: 10,
      bands: RISK_BANDS,
    },
    {
      id: "opportunity",
      name: "Opportunity",
      basis: "%การปล่อย GHG (เทียบภายใน CAT) ของแหล่งปล่อยที่มีความโอกาส",
      weight: 10,
      bands: OPPORTUNITY_BANDS,
    },
    {
      id: "sector",
      name: "Sector Guidance",
      basis: "ถ้ามีใน Sector Guidance",
      weight: null,
      bands: ["", "", "", "", ""],
      rule: "แนะนำใช้ประเมิน ถือว่า Category นั้นมีนัยสำคัญ",
    },
    {
      id: "outsourcing",
      name: "Outsourcing",
      basis: "",
      weight: null,
      bands: ["", "", "", "", ""],
      rule: "องค์กรไม่พิจารณาประเด็นนี้",
    },
    {
      id: "employee",
      name: "Employee engagement",
      basis: "",
      weight: null,
      bands: ["", "", "", "", ""],
      rule: "องค์กรไม่พิจารณาประเด็นนี้",
    },
  ],
  threshold: 2,
  thresholdNote: "ผลการประเมิน ≥ 2 คะแนน เป็นแหล่งปล่อยที่มีนัยสำคัญ นับรวมในขอบเขตการประเมิน; < 2 คะแนน ไม่มีนัยสำคัญ",
  sourceNotes: [
    "ตารางต้นฉบับช่อง Opportunity ระดับ 4 เขียนว่า \"15%<GHG≥40%\" ซึ่งน่าจะพิมพ์ผิด (น่าจะเป็น 20%) — ตรวจสอบกับเอกสารต้นฉบับก่อนใช้งาน",
  ],
};

const KEY = "cfo_saas_scope3_criteria";
const listeners = new Set<() => void>();
let cache: Scope3CriteriaTable | null = null;

function load(): Scope3CriteriaTable {
  try {
    const raw = tenantStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.criteria) && parsed.criteria.length > 0) return parsed as Scope3CriteriaTable;
    }
  } catch {
    /* ignore invalid saved data and fall back to the default table */
  }
  return DEFAULT_SCOPE3_CRITERIA;
}

export function getScope3Criteria(): Scope3CriteriaTable {
  if (!cache) cache = load();
  return cache;
}

function notify() {
  listeners.forEach((l) => l());
}

export function setScope3Criteria(next: Scope3CriteriaTable) {
  cache = next;
  tenantStorage.setItem(KEY, JSON.stringify(next));
  notify();
}

export function resetScope3Criteria() {
  tenantStorage.removeItem(KEY);
  cache = DEFAULT_SCOPE3_CRITERIA;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScope3Criteria(): Scope3CriteriaTable {
  return useSyncExternalStore(subscribe, getScope3Criteria, getScope3Criteria);
}
