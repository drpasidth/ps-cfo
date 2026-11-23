// Net Zero Pathway: เป้าหมายลดก๊าซเรือนกระจกสู่ Net Zero แยกตาม Scope 1, 2, 3
//   - ปีฐาน (baseline) → เป้าหมายระยะกลาง (interim) → ปี Net Zero
//   - แต่ละ Scope มีปีฐานและ % การลดของตัวเอง เป้าหมายรวม = ผลรวมของสาม Scope
//   - เส้นทางเป้าหมายรายปีเป็นเส้นตรงแบ่งเป็น 2 ช่วง (ปีฐาน→ระยะกลาง, ระยะกลาง→Net Zero)
//   - แผนโครงการลด (initiatives) ระบุ Scope ที่ลดได้ และใช้เทียบกับช่องว่างของแต่ละ Scope
//   - แต่ละโครงการมีประวัติการบันทึกความคืบหน้า (checkIns) เพื่อติดตามต่อเนื่อง
// เก็บในฐานข้อมูลของบริษัทผ่าน tenantStorage (tenant_kv) เหมือนฟีเจอร์ Uncertainty
import { useSyncExternalStore } from "react";
import { tenantStorage } from "./tenantStorage";

export type InitiativeStatus = "planned" | "in_progress" | "done";

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  planned: "วางแผน",
  in_progress: "กำลังดำเนินการ",
  done: "ดำเนินการแล้ว",
};

export type ScopeKey = "scope1" | "scope2" | "scope3";
export const SCOPE_KEYS: ScopeKey[] = ["scope1", "scope2", "scope3"];
export const SCOPE_LABEL: Record<ScopeKey, string> = {
  scope1: "Scope 1",
  scope2: "Scope 2",
  scope3: "Scope 3",
};

// โครงการที่ยังไม่ระบุ Scope จะนับในเป้ารวม แต่ไม่นับในช่องว่างของแต่ละ Scope
export type InitiativeScope = ScopeKey | "unassigned";
export const INITIATIVE_SCOPE_LABEL: Record<InitiativeScope, string> = {
  scope1: "Scope 1",
  scope2: "Scope 2",
  scope3: "Scope 3",
  unassigned: "ยังไม่ระบุ",
};

// บันทึกความคืบหน้าหนึ่งครั้ง (เก็บเป็นประวัติ ไม่ถูกทับ)
export interface NetZeroCheckIn {
  id: string;
  date: string; // วันที่บันทึก YYYY-MM-DD
  status: InitiativeStatus;
  progress: number; // ความคืบหน้า 0-100 (%)
  actualReductionTco2e: number; // ปริมาณที่ลดได้จริง ณ วันที่บันทึก (tCO2e/ปี) ถ้าวัดได้
  note: string;
}

export interface NetZeroInitiative {
  id: string;
  name: string; // โครงการ/มาตรการลดก๊าซ
  scope: InitiativeScope; // Scope ที่โครงการนี้ลด
  startYear: number; // ปีที่เริ่มให้ผลการลด (ค.ศ.)
  reductionTco2e: number; // ปริมาณการลดต่อปีเมื่อดำเนินการเต็มที่ (tCO2e/ปี)
  status: InitiativeStatus;
  owner: string; // ผู้รับผิดชอบ
  note: string;
  progress: number; // ความคืบหน้าล่าสุด 0-100 (%)
  dueDate: string; // กำหนดเสร็จ YYYY-MM-DD ("" = ยังไม่กำหนด)
  kpi: string; // ตัวชี้วัดความสำเร็จ
  budget: number; // งบประมาณ (บาท)
  checkIns: NetZeroCheckIn[]; // ประวัติการบันทึกความคืบหน้า
}

export interface ScopeTarget {
  interimPct: number; // % การลดจากปีฐาน ณ ปีระยะกลาง
  netZeroPct: number; // % การลดจากปีฐาน ณ ปี Net Zero
}

// รูปแบบกราฟ: เส้น หรือ แท่ง
export type ChartKind = "line" | "bar";
// กราฟแต่ละใบ: "total" = รวมทุก Scope, ที่เหลือ = แยกตาม Scope
export type ChartId = "total" | ScopeKey;
export const CHART_IDS: ChartId[] = ["total", ...SCOPE_KEYS];

export interface NetZeroPlan {
  baseYear: number; // ปีฐาน (ค.ศ.)
  interimYear: number; // ปีเป้าหมายระยะกลาง เช่น 2030
  netZeroYear: number; // ปีที่ตั้งเป้าเป็น Net Zero เช่น 2050
  baseManual: Record<ScopeKey, number>; // tCO2e กรอกเอง ใช้เมื่อยังไม่มีข้อมูลกิจกรรมของปีฐานในแต่ละ Scope
  scopeTargets: Record<ScopeKey, ScopeTarget>;
  initiatives: NetZeroInitiative[];
  chartKinds: Record<ChartId, ChartKind>; // รูปแบบกราฟที่ผู้ใช้เลือกไว้ (บันทึกพร้อมแผน)
}

const DEFAULT_TARGET: ScopeTarget = { interimPct: 42, netZeroPct: 90 };

export function defaultPlan(baseYear: number): NetZeroPlan {
  return {
    baseYear,
    interimYear: 2030,
    netZeroYear: 2050,
    baseManual: { scope1: 0, scope2: 0, scope3: 0 },
    scopeTargets: {
      scope1: { ...DEFAULT_TARGET },
      scope2: { ...DEFAULT_TARGET },
      scope3: { ...DEFAULT_TARGET },
    },
    initiatives: [],
    chartKinds: { total: "line", scope1: "line", scope2: "line", scope3: "line" },
  };
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// เติมค่าเริ่มต้นให้โครงการที่บันทึกไว้ก่อนมีฟิลด์ใหม่
export function normalizeInitiative(raw: Partial<NetZeroInitiative>): NetZeroInitiative {
  const statuses = Object.keys(INITIATIVE_STATUS_LABEL) as string[];
  const scopes = [...SCOPE_KEYS, "unassigned"] as string[];
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: raw.name ?? "",
    scope: raw.scope && scopes.includes(raw.scope) ? raw.scope : "unassigned",
    startYear: Number(raw.startYear) || 0,
    reductionTco2e: Number(raw.reductionTco2e) || 0,
    status: raw.status && statuses.includes(raw.status) ? raw.status : "planned",
    owner: raw.owner ?? "",
    note: raw.note ?? "",
    progress: clampPct(Number(raw.progress) || 0),
    dueDate: raw.dueDate ?? "",
    kpi: raw.kpi ?? "",
    budget: Number(raw.budget) || 0,
    checkIns: Array.isArray(raw.checkIns) ? raw.checkIns : [],
  };
}

export function newInitiative(startYear: number): NetZeroInitiative {
  return normalizeInitiative({ startYear });
}

// รูปแบบข้อมูลเดิมก่อนแยก Scope (ค่า % ทั้งองค์กรและปีฐานรวม) อ่านเข้ามาได้เพื่อไม่ให้ข้อมูลหาย
export type StoredPlan = Partial<Omit<NetZeroPlan, "scopeTargets" | "baseManual">> & {
  scopeTargets?: Partial<Record<ScopeKey, Partial<ScopeTarget>>>;
  baseManual?: Partial<Record<ScopeKey, number>>;
  interimReductionPct?: number;
  netZeroReductionPct?: number;
};

export function normalizePlan(raw: StoredPlan): NetZeroPlan {
  const base = defaultPlan(Number(raw.baseYear) || new Date().getFullYear());
  const legacy: ScopeTarget = {
    interimPct: raw.interimReductionPct ?? DEFAULT_TARGET.interimPct,
    netZeroPct: raw.netZeroReductionPct ?? DEFAULT_TARGET.netZeroPct,
  };
  const scopeTargets = {} as Record<ScopeKey, ScopeTarget>;
  const baseManual = {} as Record<ScopeKey, number>;
  for (const s of SCOPE_KEYS) {
    const t = raw.scopeTargets?.[s];
    scopeTargets[s] = {
      interimPct: Number(t?.interimPct ?? legacy.interimPct),
      netZeroPct: Number(t?.netZeroPct ?? legacy.netZeroPct),
    };
    baseManual[s] = Number(raw.baseManual?.[s]) || 0;
  }
  const chartKinds = {} as Record<ChartId, ChartKind>;
  for (const id of CHART_IDS) {
    chartKinds[id] = raw.chartKinds?.[id] === "bar" ? "bar" : "line";
  }
  return {
    baseYear: base.baseYear,
    interimYear: Number(raw.interimYear ?? base.interimYear),
    netZeroYear: Number(raw.netZeroYear ?? base.netZeroYear),
    baseManual,
    scopeTargets,
    initiatives: (Array.isArray(raw.initiatives) ? raw.initiatives : []).map((i) => normalizeInitiative(i)),
    chartKinds,
  };
}

// คืนข้อความแจ้งเตือนถ้าค่าที่กรอกไม่สมเหตุสมผล (null = ใช้งานได้)
export function validatePlan(plan: NetZeroPlan): string | null {
  if (!(plan.baseYear < plan.interimYear && plan.interimYear < plan.netZeroYear)) {
    return "ปีต้องเรียงลำดับ ปีฐาน < ปีเป้าหมายระยะกลาง < ปี Net Zero";
  }
  for (const s of SCOPE_KEYS) {
    const t = plan.scopeTargets[s];
    if ([t.interimPct, t.netZeroPct].some((p) => !Number.isFinite(p) || p < 0 || p > 100)) {
      return `${SCOPE_LABEL[s]}: เปอร์เซ็นต์การลดต้องอยู่ระหว่าง 0 ถึง 100`;
    }
    if (t.netZeroPct < t.interimPct) {
      return `${SCOPE_LABEL[s]}: เปอร์เซ็นต์ที่ปี Net Zero ต้องไม่น้อยกว่าเป้าหมายระยะกลาง`;
    }
    if (!Number.isFinite(plan.baseManual[s]) || plan.baseManual[s] < 0) {
      return `${SCOPE_LABEL[s]}: ปริมาณปีฐานที่กรอกเองต้องไม่ติดลบ`;
    }
  }
  return null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// เป้าหมายการปล่อย (tCO2e) ของ Scope และปีที่ระบุ; ต้องเรียก validatePlan ผ่านก่อน
export function scopeTargetFor(plan: NetZeroPlan, scope: ScopeKey, baseTco2e: number, year: number): number {
  const t = plan.scopeTargets[scope];
  const interim = baseTco2e * (1 - t.interimPct / 100);
  const netZero = baseTco2e * (1 - t.netZeroPct / 100);
  if (year <= plan.interimYear) {
    return lerp(baseTco2e, interim, (year - plan.baseYear) / (plan.interimYear - plan.baseYear));
  }
  return lerp(interim, netZero, (year - plan.interimYear) / (plan.netZeroYear - plan.interimYear));
}

// ปริมาณการลดที่วางแผนไว้ในปีนั้น (โครงการที่เริ่มให้ผลแล้วภายในปีนั้น)
// ถ้าระบุ scope จะนับเฉพาะโครงการของ Scope นั้น
export function plannedReductionInYear(initiatives: NetZeroInitiative[], year: number, scope?: ScopeKey): number {
  return initiatives
    .filter((i) => i.startYear <= year && (scope === undefined || i.scope === scope))
    .reduce((sum, i) => sum + (Number(i.reductionTco2e) || 0), 0);
}

export type Baselines = Record<ScopeKey, number>; // tCO2e ของปีฐานแต่ละ Scope
export type ActualsByYear = Map<number, Record<ScopeKey, number>>; // ค่าจริง tCO2e แต่ละปีแยก Scope

// ปีฐานของแต่ละ Scope: ใช้ค่าจากกิจกรรมของปีฐานถ้ามี ไม่เช่นนั้นใช้ค่าที่กรอกเอง
export function baselinesFrom(plan: NetZeroPlan, actualsByYear: ActualsByYear): Baselines {
  const actual = actualsByYear.get(plan.baseYear);
  const out = {} as Baselines;
  for (const s of SCOPE_KEYS) {
    const a = actual?.[s] ?? 0;
    out[s] = a > 0 ? a : plan.baseManual[s];
  }
  return out;
}

export interface YearFigures {
  target: number; // เป้าหมายการปล่อย (tCO2e)
  actual: number | null; // ค่าจริง (tCO2e) ถ้ามีข้อมูลของปีนั้น
  required: number; // ปริมาณที่ต้องลดจากปีฐาน (tCO2e)
  planned: number; // ปริมาณที่ลดได้ตามแผนโครงการ (tCO2e)
  gap: number; // ช่องว่าง = ต้องลด - ลดได้ตามแผน (>0 หมายถึงยังขาด)
}

export interface PathwayYear extends YearFigures {
  year: number;
  byScope: Record<ScopeKey, YearFigures>;
}

// คำนวณเป้าหมาย ค่าจริง และช่องว่างของทุกปี ทั้งรวมและแยก Scope
// เป้ารวม = ผลรวมเป้าของสาม Scope; แผนรวมนับทุกโครงการ (รวมที่ยังไม่ระบุ Scope)
export function computePathway(plan: NetZeroPlan, baselines: Baselines, actualsByYear: ActualsByYear): PathwayYear[] {
  const out: PathwayYear[] = [];
  for (let y = plan.baseYear; y <= plan.netZeroYear; y++) {
    const actualsY = actualsByYear.get(y) ?? null;
    const byScope = {} as Record<ScopeKey, YearFigures>;
    for (const s of SCOPE_KEYS) {
      const target = scopeTargetFor(plan, s, baselines[s], y);
      const required = baselines[s] - target;
      const planned = plannedReductionInYear(plan.initiatives, y, s);
      byScope[s] = {
        target,
        actual: actualsY ? actualsY[s] : null,
        required,
        planned,
        gap: required - planned,
      };
    }
    const sum = (f: (v: YearFigures) => number) => SCOPE_KEYS.reduce((t, s) => t + f(byScope[s]), 0);
    const required = sum((v) => v.required);
    const planned = plannedReductionInYear(plan.initiatives, y);
    out.push({
      year: y,
      target: sum((v) => v.target),
      actual: actualsY ? sum((v) => v.actual ?? 0) : null,
      required,
      planned,
      gap: required - planned,
      byScope,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ความคืบหน้าและการแจ้งเตือน
// ---------------------------------------------------------------------------
export const STALE_DAYS = 90; // ถ้าไม่อัปเดตความคืบหน้าเกินจำนวนวันนี้ จะแจ้งเตือน
const DAY_MS = 24 * 60 * 60 * 1000;

// วันที่วันนี้ตามเวลาเครื่องผู้ใช้ รูปแบบ YYYY-MM-DD
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function latestCheckIn(i: NetZeroInitiative): NetZeroCheckIn | null {
  if (i.checkIns.length === 0) return null;
  return [...i.checkIns].sort((a, b) => b.date.localeCompare(a.date))[0];
}

export type AlertLevel = "danger" | "warning" | "info";

export interface PlanAlert {
  level: AlertLevel;
  text: string;
}

// รวมการแจ้งเตือนทั้งหมดของแผน: ค่าจริงเกินเป้า (รวมและแยก Scope), ไม่มีข้อมูลกิจกรรม,
// ช่องว่างการลดของแต่ละ Scope ณ ปีเป้าหมาย, โครงการเลยกำหนด/ยังไม่เริ่ม/ไม่อัปเดต/ยังไม่ระบุ Scope
export function buildAlerts(
  plan: NetZeroPlan,
  years: PathwayYear[],
  reportingYear: number,
  today: string,
): PlanAlert[] {
  const alerts: PlanAlert[] = [];
  const num = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

  for (const y of years) {
    if (y.year === plan.baseYear) continue;
    if (y.actual !== null && y.actual > y.target) {
      alerts.push({ level: "danger", text: `ปี ${y.year}: ค่าจริงรวมเกินเป้าหมาย ${num(y.actual - y.target)} tCO2e` });
    }
    for (const s of SCOPE_KEYS) {
      const v = y.byScope[s];
      if (v.actual !== null && v.actual > v.target) {
        alerts.push({ level: "danger", text: `ปี ${y.year} ${SCOPE_LABEL[s]}: ค่าจริงเกินเป้าหมาย ${num(v.actual - v.target)} tCO2e` });
      }
    }
    if (y.actual === null && y.year < reportingYear) {
      alerts.push({ level: "warning", text: `ปี ${y.year}: ยังไม่มีข้อมูลกิจกรรม จึงยังประเมินผลไม่ได้` });
    }
  }

  const milestones: [string, number][] = [["ระยะกลาง", plan.interimYear], ["Net Zero", plan.netZeroYear]];
  for (const [label, year] of milestones) {
    const row = years.find((y) => y.year === year);
    if (!row) continue;
    for (const s of SCOPE_KEYS) {
      const gap = row.byScope[s].gap;
      if (gap > 0) {
        alerts.push({
          level: "warning",
          text: `${SCOPE_LABEL[s]}: แผนโครงการยังขาดการลดอีก ${num(gap)} tCO2e/ปี เพื่อถึงเป้า${label} (ปี ${year})`,
        });
      }
    }
  }

  const todayMs = Date.parse(today);
  for (const i of plan.initiatives) {
    if (i.status === "done") continue;
    const name = i.name || "(ยังไม่ตั้งชื่อ)";
    if (i.scope === "unassigned") {
      alerts.push({ level: "info", text: `${name}: ยังไม่ระบุ Scope จึงไม่นับในช่องว่างของแต่ละ Scope` });
    }
    if (i.dueDate && i.dueDate < today) {
      alerts.push({ level: "danger", text: `${name}: เลยกำหนดเสร็จ ${i.dueDate} ยังไม่เสร็จ` });
    }
    if (i.status === "planned" && i.startYear <= reportingYear) {
      alerts.push({ level: "warning", text: `${name}: ถึงปีที่ควรเริ่มให้ผล (${i.startYear}) แต่ยังอยู่ในขั้นวางแผน` });
    }
    const last = latestCheckIn(i);
    if (!last) {
      alerts.push({ level: "info", text: `${name}: ยังไม่เคยบันทึกความคืบหน้า` });
    } else {
      const days = Math.floor((todayMs - Date.parse(last.date)) / DAY_MS);
      if (days > STALE_DAYS) alerts.push({ level: "warning", text: `${name}: ไม่มีการอัปเดตความคืบหน้ามาแล้ว ${days} วัน` });
    }
  }
  return alerts;
}

// ---------------------------------------------------------------------------
// Storage (tenant-scoped, same pattern as uncertainty.ts)
// ---------------------------------------------------------------------------
const KEY = "cfo_saas_net_zero_pathway";
const listeners = new Set<() => void>();
// undefined = ยังไม่อ่านจากเครื่องมือเก็บข้อมูล, null = ยังไม่เคยบันทึกแผน
let cache: NetZeroPlan | null | undefined;

function load(): NetZeroPlan | null {
  try {
    const raw = tenantStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return normalizePlan(parsed as StoredPlan);
    }
  } catch {
    /* ignore invalid saved data */
  }
  return null;
}

function getSnapshot(): NetZeroPlan | null {
  if (cache === undefined) cache = load();
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveNetZeroPlan(plan: NetZeroPlan) {
  cache = plan;
  tenantStorage.setItem(KEY, JSON.stringify(plan));
  listeners.forEach((l) => l());
}

export function useNetZeroPlan(): NetZeroPlan | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
