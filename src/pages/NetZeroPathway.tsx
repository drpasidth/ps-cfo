import { useEffect, useMemo, useRef, useState } from "react";
import { Target, Save, Plus, Trash2, CheckCircle, AlertTriangle, Info, History, Sparkles, Copy, RotateCcw, Bookmark, StopCircle, Printer, Download, Lock } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import PathwayChart from "../components/PathwayChart";
import NetZeroPrintReport from "../components/NetZeroPrintReport";
import { downloadNetZeroWord } from "../utils/netZeroReport";
import { apiJson } from "../api";
import { tenantStorage } from "../data/tenantStorage";
import { yearOf, type ActivityRecord } from "../types";
import { calculateTotals, formatNumber } from "../utils/calculations";
import { filterActivitiesByPackage, hasFeature } from "../utils/packages";
import {
  INITIATIVE_SCOPE_LABEL,
  INITIATIVE_STATUS_LABEL,
  SCOPE_KEYS,
  SCOPE_LABEL,
  baselinesFrom,
  buildAlerts,
  clampPct,
  computePathway,
  defaultPlan,
  latestCheckIn,
  newInitiative,
  normalizePlan,
  saveNetZeroPlan,
  todayIso,
  useNetZeroPlan,
  validatePlan,
  type ActualsByYear,
  type ChartId,
  type ChartKind,
  type InitiativeScope,
  type InitiativeStatus,
  type NetZeroInitiative,
  type NetZeroPlan,
  type PathwayYear,
  type PlanAlert,
  type ScopeKey,
} from "../data/netZeroPathway";

const ALERT_STYLE: Record<PlanAlert["level"], { cls: string; icon: typeof Info }> = {
  danger: { cls: "border-red-300 bg-red-50 text-red-700", icon: AlertTriangle },
  warning: { cls: "border-amber-300 bg-amber-50 text-amber-800", icon: AlertTriangle },
  info: { cls: "border-blue-200 bg-blue-50 text-blue-700", icon: Info },
};

// % การลดเทียบกับปีฐาน (ใช้แสดงผลรวม)
const reductionPct = (target: number, base: number) => (base > 0 ? (1 - target / base) * 100 : 0);

// คำตอบจาก AI ที่ผู้ใช้กดบันทึกไว้ (เก็บในพื้นที่ข้อมูลของบริษัท)
interface SavedAdvice {
  id: string;
  title: string; // เช่น ปีรายงานและช่วงแผน
  savedAt: string;
  reply: string;
}
const ADVICE_KEY = "cfo_saas_net_zero_advice";

function loadSavedAdvice(): SavedAdvice[] {
  try {
    const raw = tenantStorage.getItem(ADVICE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function NetZeroPathway() {
  const { state } = useApp();
  const { session, hasFeature: canFeature } = useAuth();
  const canWord = canFeature("report_word");
  const stored = useNetZeroPlan();
  const today = todayIso();

  const reportingYear = Number(state.company.reportingYear) || new Date().getFullYear();
  const defaultBase = state.company.basePeriodYear || reportingYear;
  // normalizePlan เติมค่าที่ขาดหาย (เช่น chartKinds) ให้แผนที่เก็บไว้ก่อนฟิลด์นั้นถูกเพิ่ม
  const savedPlan = useMemo(() => normalizePlan(stored ?? defaultPlan(defaultBase)), [stored, defaultBase]);

  // ค่าที่กำลังแก้ไข (ยังไม่บันทึก) จะถูกบันทึกเมื่อกดปุ่มบันทึก
  const [draft, setDraft] = useState<NetZeroPlan>(savedPlan);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(savedPlan), [savedPlan]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedPlan);
  const error = validatePlan(draft);

  // กิจกรรมที่ตรงกับแพ็กเกจของบริษัท รวมเป็นค่าการปล่อยรายปีแยกตาม Scope
  const activities = useMemo(
    () => filterActivitiesByPackage(state.activities, session?.tenant.package),
    [state.activities, session?.tenant.package],
  );
  const actualsByYear = useMemo<ActualsByYear>(() => {
    const groups = new Map<number, ActivityRecord[]>();
    for (const a of activities) {
      const y = yearOf(a, state.company);
      const list = groups.get(y);
      if (list) list.push(a);
      else groups.set(y, [a]);
    }
    const out: ActualsByYear = new Map();
    for (const [y, list] of groups) {
      const t = calculateTotals(list);
      // roundedTotal เป็นหน่วย kgCO2e จึงหาร 1000 เป็น tCO2e (เหมือน co2Tonnes)
      out.set(y, {
        scope1: t.scope1.roundedTotal / 1000,
        scope2: t.scope2.roundedTotal / 1000,
        scope3: t.scope3.roundedTotal / 1000,
      });
    }
    return out;
  }, [activities, state.company]);

  const baselines = useMemo(() => baselinesFrom(draft, actualsByYear), [draft, actualsByYear]);
  const baselineTotal = SCOPE_KEYS.reduce((t, s) => t + baselines[s], 0);
  const rows = useMemo<PathwayYear[]>(
    () => (error ? [] : computePathway(draft, baselines, actualsByYear)),
    [draft, baselines, actualsByYear, error],
  );
  const interimRow = rows.find((r) => r.year === draft.interimYear) ?? null;
  const netZeroRow = rows.find((r) => r.year === draft.netZeroYear) ?? null;
  const alerts = useMemo<PlanAlert[]>(
    () => (error ? [] : buildAlerts(draft, rows, reportingYear, today)),
    [draft, rows, reportingYear, today, error],
  );

  const setField = <K extends keyof NetZeroPlan>(key: K, value: NetZeroPlan[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const setScopeTarget = (scope: ScopeKey, key: "interimPct" | "netZeroPct", value: number) => {
    setDraft((d) => ({
      ...d,
      scopeTargets: { ...d.scopeTargets, [scope]: { ...d.scopeTargets[scope], [key]: value } },
    }));
    setSaved(false);
  };

  const setChartKind = (id: ChartId, kind: ChartKind) => {
    setDraft((d) => ({ ...d, chartKinds: { ...d.chartKinds, [id]: kind } }));
    setSaved(false);
  };

  const setBaseManual = (scope: ScopeKey, value: number) => {
    setDraft((d) => ({ ...d, baseManual: { ...d.baseManual, [scope]: value } }));
    setSaved(false);
  };

  const updateInitiative = (id: string, patch: Partial<NetZeroInitiative>) => {
    setDraft((d) => ({
      ...d,
      initiatives: d.initiatives.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    setSaved(false);
  };

  const addInitiative = () => {
    setDraft((d) => ({ ...d, initiatives: [...d.initiatives, newInitiative(d.baseYear + 1)] }));
    setSaved(false);
  };

  const removeInitiative = (id: string) => {
    setDraft((d) => ({ ...d, initiatives: d.initiatives.filter((i) => i.id !== id) }));
    setSaved(false);
  };

  const save = () => {
    if (error) return;
    saveNetZeroPlan(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ---- บันทึกความคืบหน้า (เก็บเป็นประวัติ) ----
  const [ciInitiativeId, setCiInitiativeId] = useState("");
  const [ciDate, setCiDate] = useState(today);
  const [ciStatus, setCiStatus] = useState<InitiativeStatus>("in_progress");
  const [ciProgress, setCiProgress] = useState(0);
  const [ciActual, setCiActual] = useState(0);
  const [ciNote, setCiNote] = useState("");
  const selectedId = draft.initiatives.some((i) => i.id === ciInitiativeId)
    ? ciInitiativeId
    : (draft.initiatives[0]?.id ?? "");
  const selected = draft.initiatives.find((i) => i.id === selectedId) ?? null;
  const history = selected ? [...selected.checkIns].sort((a, b) => b.date.localeCompare(a.date)) : [];

  const saveCheckIn = () => {
    // บันทึกความคืบหน้าเฉพาะเมื่อไม่มีการแก้ไขค้างอยู่ เพื่อไม่ให้บันทึกค่าที่ยังไม่ตั้งใจ
    if (!selected || dirty || error) return;
    const checkIn = {
      id: crypto.randomUUID(),
      date: ciDate || today,
      status: ciStatus,
      progress: clampPct(ciProgress),
      actualReductionTco2e: Math.max(0, Number(ciActual) || 0),
      note: ciNote.trim(),
    };
    saveNetZeroPlan({
      ...draft,
      initiatives: draft.initiatives.map((i) =>
        i.id === selected.id
          ? { ...i, status: checkIn.status, progress: checkIn.progress, checkIns: [...i.checkIns, checkIn] }
          : i,
      ),
    });
    setCiNote("");
    setCiActual(0);
  };

  // ---- คำแนะนำจาก AI ----
  const canUseAi = hasFeature(session?.tenant.package, "ai");
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [lastContext, setLastContext] = useState<Record<string, unknown> | null>(null);
  const [savedAdvice, setSavedAdvice] = useState<SavedAdvice[]>(loadSavedAdvice);
  const [copied, setCopied] = useState<string | null>(null);

  // รวบรวมข้อมูลแผนปัจจุบันเป็นคำสั่งสำหรับ AI
  const buildAiContext = () => {
    const context = {
      reportingYear,
      today,
      baseYear: draft.baseYear,
      interimYear: draft.interimYear,
      netZeroYear: draft.netZeroYear,
      scopeTargets: draft.scopeTargets,
      baselineByScope: mapScopes(baselines, round1),
      baselineTotal: round1(baselineTotal),
      yearly: rows.map((r) => ({
        year: r.year,
        target: round1(r.target),
        actual: r.actual === null ? null : round1(r.actual),
        gap: round1(r.gap),
        byScope: mapScopes(r.byScope, (v) => ({
          target: round1(v.target),
          actual: v.actual === null ? null : round1(v.actual),
          planned: round1(v.planned),
          gap: round1(v.gap),
        })),
      })),
      initiatives: draft.initiatives.map((i) => {
        const last = latestCheckIn(i);
        return {
          name: i.name,
          scope: INITIATIVE_SCOPE_LABEL[i.scope],
          startYear: i.startYear,
          reductionTco2e: i.reductionTco2e,
          status: INITIATIVE_STATUS_LABEL[i.status],
          progressPct: i.progress,
          dueDate: i.dueDate,
          budgetBaht: i.budget,
          kpi: i.kpi,
          owner: i.owner,
          lastUpdate: last ? { date: last.date, note: last.note, actualReductionTco2e: last.actualReductionTco2e } : null,
        };
      }),
      alerts: alerts.map((a) => a.text),
    };
    return context;
  };

  // ส่งคำสั่งไปยัง AI; สามารถยกเลิกได้ด้วย abortAi
  const runAi = async (context: Record<string, unknown>) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setAdviceBusy(true);
    setAdviceError(null);
    try {
      const res = await apiJson<{ reply: string }>("/api/net-zero/advice", {
        method: "POST",
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });
      setAdvice(res.reply);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setAdviceError("ยกเลิกการวิเคราะห์แล้ว");
      } else {
        setAdviceError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    } finally {
      abortRef.current = null;
      setAdviceBusy(false);
    }
  };

  const askAi = () => {
    if (error) return;
    const context = buildAiContext();
    setLastContext(context); // เก็บไว้สำหรับ "ส่งคำสั่งเดิมอีกครั้ง"
    void runAi(context);
  };

  const redoAi = () => {
    if (lastContext) void runAi(lastContext);
  };

  const abortAi = () => abortRef.current?.abort();

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      setAdviceError("คัดลอกไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const persistSavedAdvice = (next: SavedAdvice[]) => {
    setSavedAdvice(next);
    tenantStorage.setItem(ADVICE_KEY, JSON.stringify(next));
  };

  const saveAdvice = () => {
    if (!advice) return;
    persistSavedAdvice([
      {
        id: crypto.randomUUID(),
        title: `ปี ${reportingYear} · แผน ${draft.baseYear}–${draft.netZeroYear}`,
        savedAt: new Date().toLocaleString("th-TH"),
        reply: advice,
      },
      ...savedAdvice,
    ]);
  };

  const deleteSavedAdvice = (id: string) => {
    persistSavedAdvice(savedAdvice.filter((s) => s.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
    <div className="print-hide space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Net Zero Pathway</h1>
            <p className="text-gray-500 text-sm">
              กำหนดเป้าหมายลดก๊าซเรือนกระจกแยกตาม Scope 1, 2, 3 จากปีฐานสู่ปี Net Zero และติดตามเทียบกับค่าจริงจากกิจกรรมที่บันทึกไว้
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => window.print()} disabled={!!error || rows.length === 0}
            title="พิมพ์ หรือบันทึกเป็นไฟล์ PDF (เลือก Save as PDF)">
            <Printer className="w-4 h-4 mr-2" /> พิมพ์ / PDF
          </button>
          {canWord ? (
            <button type="button" className="btn-secondary" disabled={!!error || rows.length === 0}
              onClick={() =>
                downloadNetZeroWord({ company: state.company, plan: draft, baselines, rows, alerts, reportingYear })
                  .catch(() => alert("สร้างไฟล์ Word ไม่สำเร็จ"))
              }>
              <Download className="w-4 h-4 mr-2" /> Word (.docx)
            </button>
          ) : (
            <button type="button" disabled title="ต้องใช้แพ็กเกจที่มีรายงาน Word" className="btn-secondary opacity-60 cursor-not-allowed">
              <Lock className="w-4 h-4 mr-2" /> Word (.docx) — ไม่รวมในแพ็กเกจนี้
            </button>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={!dirty || !!error}>
            <Save className="w-4 h-4 mr-2" /> บันทึกแผน
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-700 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> บันทึกเรียบร้อยแล้ว
            </span>
          )}
          {!saved && dirty && <span className="text-amber-600 text-sm">มีการแก้ไขที่ยังไม่บันทึก</span>}
        </div>
      </div>

      {error && <div className="panel border-red-300 bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* การตั้งค่าเป้าหมาย */}
      <div className="panel p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">1. กำหนดเป้าหมายแยกตาม Scope</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="text-sm space-y-1">
            <span className="text-gray-600">ปีฐาน (ค.ศ.)</span>
            <input type="number" className="input" value={draft.baseYear}
              onChange={(e) => setField("baseYear", Number(e.target.value))} />
          </label>
          <div className="text-sm space-y-1">
            <span className="text-gray-600">ปีฐานที่ใช้คำนวณ</span>
            <div className="input bg-gray-50">{draft.baseYear}</div>
          </div>
          <label className="text-sm space-y-1">
            <span className="text-gray-600">ปีเป้าหมายระยะกลาง (ค.ศ.)</span>
            <input type="number" className="input" value={draft.interimYear}
              onChange={(e) => setField("interimYear", Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-gray-600">ปี Net Zero (ค.ศ.)</span>
            <input type="number" className="input" value={draft.netZeroYear}
              onChange={(e) => setField("netZeroYear", Number(e.target.value))} />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left w-28">Scope</th>
                <th className="px-3 py-2 text-left w-52">ปริมาณการปล่อยปีฐาน (tCO2e)</th>
                <th className="px-3 py-2 text-left w-44">% การลดระยะกลาง (ปี {draft.interimYear})</th>
                <th className="px-3 py-2 text-left w-44">% การลด Net Zero (ปี {draft.netZeroYear})</th>
                <th className="px-3 py-2 text-left">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {SCOPE_KEYS.map((s) => {
                const t = draft.scopeTargets[s];
                const actual = actualsByYear.get(draft.baseYear)?.[s] ?? 0;
                return (
                  <tr key={s} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{SCOPE_LABEL[s]}</td>
                    <td className="px-3 py-2">
                      {actual > 0 ? (
                        <input type="number" className="input bg-gray-50" readOnly value={Math.round(actual * 100) / 100} />
                      ) : (
                        <input type="number" min={0} className="input" value={draft.baseManual[s]}
                          onChange={(e) => setBaseManual(s, Number(e.target.value) || 0)} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} max={100} className="input" value={t.interimPct}
                        onChange={(e) => setScopeTarget(s, "interimPct", Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} max={100} className="input" value={t.netZeroPct}
                        onChange={(e) => setScopeTarget(s, "netZeroPct", Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {actual > 0
                        ? `ดึงอัตโนมัติจากกิจกรรมปี ${draft.baseYear}`
                        : "ยังไม่มีข้อมูลกิจกรรมของปีฐาน กรอกเองได้"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-gray-200 font-semibold">
                <td className="px-3 py-2">รวม</td>
                <td className="px-3 py-2">{formatNumber(baselineTotal, 2)}</td>
                <td className="px-3 py-2">{formatNumber(reductionPct(interimRow?.target ?? baselineTotal, baselineTotal), 1)}%</td>
                <td className="px-3 py-2">{formatNumber(reductionPct(netZeroRow?.target ?? baselineTotal, baselineTotal), 1)}%</td>
                <td className="px-3 py-2 text-xs font-normal text-gray-400">% รวมคำนวณจากผลรวมของแต่ละ Scope</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* สรุปผล */}
      {!error && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard title="การปล่อยปีฐานรวม" value={baselineTotal} note={`ปี ${draft.baseYear}`} />
          <SummaryCard
            title="เป้าหมายระยะกลาง (รวม)"
            value={interimRow?.target ?? 0}
            note={`ปี ${draft.interimYear} · ต้องลด ${formatNumber(interimRow?.required ?? 0, 1)} · วางแผนไว้ ${formatNumber(interimRow?.planned ?? 0, 1)}`}
            gap={interimRow?.gap}
          />
          <SummaryCard
            title="เป้าหมาย Net Zero (รวม, ก่อนชดเชย)"
            value={netZeroRow?.target ?? 0}
            note={`ปี ${draft.netZeroYear} · ต้องลด ${formatNumber(netZeroRow?.required ?? 0, 1)} · วางแผนไว้ ${formatNumber(netZeroRow?.planned ?? 0, 1)}`}
            gap={netZeroRow?.gap}
          />
          <SummaryCard
            title="ส่วนที่ต้องชดเชย"
            value={netZeroRow?.target ?? 0}
            note="tCO2e ต่อปีที่ต้องชดเชยในปี Net Zero"
          />
        </div>
      )}

      {/* การแจ้งเตือน */}
      {!error && (
        <div className="panel p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">การแจ้งเตือน</h2>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4" /> ไม่มีรายการที่ต้องติดตาม
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, idx) => {
                const style = ALERT_STYLE[a.level];
                const Icon = style.icon;
                return (
                  <li key={idx} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${style.cls}`}>
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{a.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* กราฟแยกตาม Scope */}
      {!error && rows.length > 0 && (
        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">2. เส้นทางการลดก๊าซเรือนกระจก</h2>
          <p className="text-sm text-gray-500 mb-4">
            เส้นทึบสีเขียว = เป้าหมาย · เส้นประสีส้ม = ปริมาณที่คาดว่าจะเหลือหลังใช้แผนโครงการ · จุดสีน้ำเงิน = ค่าจริงจากกิจกรรม (tCO2e)
            แต่ละกราฟมีสเกลแกนตั้งของตัวเอง
          </p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">รวมทุก Scope</h3>
              <PathwayChart
                color="#059669"
                kind={draft.chartKinds?.total ?? "line"}
                onKindChange={(k) => setChartKind("total", k)}
                interimYear={draft.interimYear}
                rows={rows.map((r) => ({
                  year: r.year,
                  target: r.target,
                  actual: r.actual,
                  withPlan: r.target + r.gap,
                }))}
              />
            </div>
            {SCOPE_KEYS.map((s) => (
              <div key={s}>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">{SCOPE_LABEL[s]}</h3>
                <PathwayChart
                  color="#059669"
                  kind={draft.chartKinds?.[s] ?? "line"}
                  onKindChange={(k) => setChartKind(s, k)}
                  interimYear={draft.interimYear}
                  rows={rows.map((r) => ({
                    year: r.year,
                    target: r.byScope[s].target,
                    actual: r.byScope[s].actual,
                    withPlan: r.byScope[s].target + r.byScope[s].gap,
                  }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* แผนโครงการลด */}
      <div className="panel p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">3. แผนโครงการ/มาตรการลดก๊าซ</h2>
            <p className="text-sm text-gray-500">
              ระบุ Scope ที่โครงการลดได้ ปริมาณลดต่อปีเมื่อดำเนินการเต็มที่ ใช้เทียบกับช่องว่างของแต่ละ Scope
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={addInitiative}>
            <Plus className="w-4 h-4 mr-2" /> เพิ่มโครงการ
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm min-w-[1500px] w-full">
            <thead className="bg-gray-50 text-gray-600">
              <tr className="whitespace-nowrap">
                <th className="px-2 py-2 text-left w-[260px]">โครงการ/มาตรการ</th>
                <th className="px-2 py-2 text-left w-[140px]">Scope</th>
                <th className="px-2 py-2 text-left w-[110px]">ปีที่เริ่มให้ผล</th>
                <th className="px-2 py-2 text-left w-[140px]">ลดได้ (tCO2e/ปี)</th>
                <th className="px-2 py-2 text-left w-[180px]">สถานะ</th>
                <th className="px-2 py-2 text-left w-[120px]">ความคืบหน้า %</th>
                <th className="px-2 py-2 text-left w-[180px]">กำหนดเสร็จ</th>
                <th className="px-2 py-2 text-left w-[140px]">งบประมาณ (บาท)</th>
                <th className="px-2 py-2 text-left w-[200px]">KPI</th>
                <th className="px-2 py-2 text-left w-[160px]">ผู้รับผิดชอบ</th>
                <th className="px-2 py-2 text-left w-[130px]">อัปเดตล่าสุด</th>
                <th className="px-2 py-2 text-left w-[220px]">หมายเหตุ</th>
                <th className="px-2 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {draft.initiatives.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-gray-400">
                    ยังไม่มีโครงการ กดปุ่ม "เพิ่มโครงการ" เพื่อเริ่มวางแผน
                  </td>
                </tr>
              )}
              {draft.initiatives.map((i) => {
                const last = latestCheckIn(i);
                return (
                  <tr key={i.id} className="border-t border-gray-100 align-top">
                    <td className="px-2 py-2">
                      <input className="input" placeholder="เช่น เปลี่ยนมาใช้พลังงานหมุนเวียน" value={i.name}
                        onChange={(e) => updateInitiative(i.id, { name: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <select className="input" value={i.scope}
                        onChange={(e) => updateInitiative(i.id, { scope: e.target.value as InitiativeScope })}>
                        {(Object.keys(INITIATIVE_SCOPE_LABEL) as InitiativeScope[]).map((s) => (
                          <option key={s} value={s}>{INITIATIVE_SCOPE_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className="input" value={i.startYear}
                        onChange={(e) => updateInitiative(i.id, { startYear: Number(e.target.value) })} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0} className="input" value={i.reductionTco2e}
                        onChange={(e) => updateInitiative(i.id, { reductionTco2e: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="px-2 py-2">
                      <select className="input" value={i.status}
                        onChange={(e) => updateInitiative(i.id, { status: e.target.value as InitiativeStatus })}>
                        {(Object.keys(INITIATIVE_STATUS_LABEL) as InitiativeStatus[]).map((s) => (
                          <option key={s} value={s}>{INITIATIVE_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0} max={100} className="input" value={i.progress}
                        onChange={(e) => updateInitiative(i.id, { progress: clampPct(Number(e.target.value)) })} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="date" className="input" value={i.dueDate}
                        onChange={(e) => updateInitiative(i.id, { dueDate: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0} className="input" value={i.budget}
                        onChange={(e) => updateInitiative(i.id, { budget: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="px-2 py-2">
                      <input className="input" placeholder="เช่น % พลังงานหมุนเวียน" value={i.kpi}
                        onChange={(e) => updateInitiative(i.id, { kpi: e.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <input className="input" value={i.owner}
                        onChange={(e) => updateInitiative(i.id, { owner: e.target.value })} />
                    </td>
                    <td className="px-2 py-2 text-gray-500">{last ? last.date : "-"}</td>
                    <td className="px-2 py-2">
                      <input className="input" value={i.note}
                        onChange={(e) => updateInitiative(i.id, { note: e.target.value })} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button type="button" className="text-red-600 p-1" title="ลบโครงการ"
                        onClick={() => removeInitiative(i.id)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* บันทึกความคืบหน้า */}
      {!error && (
        <div className="panel p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">4. บันทึกความคืบหน้า</h2>
            <p className="text-sm text-gray-500">
              บันทึกทุกครั้งที่มีการอัปเดต ระบบเก็บเป็นประวัติ และใช้วันที่ล่าสุดในการแจ้งเตือนว่าไม่มีการอัปเดต
            </p>
          </div>
          {draft.initiatives.length === 0 ? (
            <p className="text-sm text-gray-400">เพิ่มโครงการในข้อ 3 ก่อน จึงจะบันทึกความคืบหน้าได้</p>
          ) : (
            <>
              {dirty && (
                <div className="text-sm text-amber-700">กรุณากดบันทึกแผนที่แก้ไขก่อน จึงจะบันทึกความคืบหน้าได้</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">โครงการ</span>
                  <select className="input" value={selectedId} onChange={(e) => setCiInitiativeId(e.target.value)}>
                    {draft.initiatives.map((i) => (
                      <option key={i.id} value={i.id}>{i.name || "(ยังไม่ตั้งชื่อ)"}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">วันที่บันทึก</span>
                  <input type="date" className="input" value={ciDate} onChange={(e) => setCiDate(e.target.value)} />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">สถานะ</span>
                  <select className="input" value={ciStatus}
                    onChange={(e) => setCiStatus(e.target.value as InitiativeStatus)}>
                    {(Object.keys(INITIATIVE_STATUS_LABEL) as InitiativeStatus[]).map((s) => (
                      <option key={s} value={s}>{INITIATIVE_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">ความคืบหน้า (%)</span>
                  <input type="number" min={0} max={100} className="input" value={ciProgress}
                    onChange={(e) => setCiProgress(Number(e.target.value))} />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">ลดได้จริง ณ วันที่บันทึก (tCO2e/ปี)</span>
                  <input type="number" min={0} className="input" value={ciActual}
                    onChange={(e) => setCiActual(Number(e.target.value))} />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-gray-600">หมายเหตุ / สิ่งที่ทำไปแล้ว</span>
                  <input className="input" value={ciNote} onChange={(e) => setCiNote(e.target.value)} />
                </label>
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={saveCheckIn} disabled={!selected || dirty}>
                  <History className="w-4 h-4 mr-2" /> บันทึกความคืบหน้า
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">วันที่</th>
                      <th className="px-3 py-2 text-left">สถานะ</th>
                      <th className="px-3 py-2 text-right">ความคืบหน้า</th>
                      <th className="px-3 py-2 text-right">ลดได้จริง (tCO2e/ปี)</th>
                      <th className="px-3 py-2 text-left">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                          ยังไม่มีประวัติความคืบหน้าของโครงการนี้
                        </td>
                      </tr>
                    )}
                    {history.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">{c.date}</td>
                        <td className="px-3 py-1.5">{INITIATIVE_STATUS_LABEL[c.status]}</td>
                        <td className="px-3 py-1.5 text-right">{c.progress}%</td>
                        <td className="px-3 py-1.5 text-right">{formatNumber(c.actualReductionTco2e, 1)}</td>
                        <td className="px-3 py-1.5">{c.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ตารางเทียบรายปี */}
      {!error && (
        <div className="panel p-0 overflow-x-auto">
          <div className="px-6 pt-6">
            <h2 className="text-lg font-semibold text-gray-900">5. เป้าหมายและผลการดำเนินงานรายปี</h2>
            <p className="text-sm text-gray-500 mb-3">
              ค่าจริงดึงจากกิจกรรมที่บันทึกในหน้า Scope 1/2/3 ของแต่ละปี · ช่องว่าง = ปริมาณที่ต้องลดเพิ่มจากแผนที่มีอยู่ (ค่าบวก = ยังขาด)
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left" rowSpan={2}>ปี</th>
                <th className="px-3 py-2 text-center" colSpan={3}>เป้าหมายแยก Scope (tCO2e)</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>เป้ารวม</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>ค่าจริงรวม</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>จริง − เป้า</th>
                <th className="px-3 py-2 text-center" colSpan={3}>ช่องว่างแยก Scope</th>
                <th className="px-3 py-2 text-right" rowSpan={2}>ช่องว่างรวม</th>
                <th className="px-3 py-2 text-center" rowSpan={2}>สถานะ</th>
              </tr>
              <tr>
                {SCOPE_KEYS.map((s) => (
                  <th key={`t-${s}`} className="px-3 py-1 text-right font-medium">{SCOPE_LABEL[s]}</th>
                ))}
                {SCOPE_KEYS.map((s) => (
                  <th key={`g-${s}`} className="px-3 py-1 text-right font-medium">{SCOPE_LABEL[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isBase = r.year === draft.baseYear;
                const diff = r.actual === null ? null : r.actual - r.target;
                const status = isBase
                  ? { text: "ปีฐาน", cls: "bg-gray-100 text-gray-700" }
                  : r.actual === null
                    ? { text: "ยังไม่มีข้อมูล", cls: "bg-gray-100 text-gray-500" }
                    : diff! <= 0
                      ? { text: "อยู่ในเป้า", cls: "bg-emerald-100 text-emerald-700" }
                      : { text: "เกินเป้า", cls: "bg-red-100 text-red-700" };
                return (
                  <tr key={r.year} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium">{r.year}</td>
                    {SCOPE_KEYS.map((s) => (
                      <td key={`t-${s}`} className="px-3 py-1.5 text-right">{formatNumber(r.byScope[s].target, 1)}</td>
                    ))}
                    <td className="px-3 py-1.5 text-right">{formatNumber(r.target, 1)}</td>
                    <td className="px-3 py-1.5 text-right">{r.actual === null ? "-" : formatNumber(r.actual, 1)}</td>
                    <td className="px-3 py-1.5 text-right">{diff === null ? "-" : formatNumber(diff, 1)}</td>
                    {SCOPE_KEYS.map((s) => (
                      <td key={`g-${s}`} className={`px-3 py-1.5 text-right ${r.byScope[s].gap > 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {formatNumber(r.byScope[s].gap, 1)}
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right ${r.gap > 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {formatNumber(r.gap, 1)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* คำแนะนำจาก AI */}
      {!error && (
        <div className="panel p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">6. คำแนะนำจาก AI</h2>
              <p className="text-sm text-gray-500">
                AI จะวิเคราะห์เป้าหมายและช่องว่างแยกตาม Scope โครงการ และการแจ้งเตือน แล้วเสนอมาตรการเพิ่มเติม
                ผลลัพธ์เป็นคำแนะนำเบื้องต้นที่ต้องตรวจสอบก่อนนำไปใช้
              </p>
            </div>
            {canUseAi && (
              <div className="flex items-center gap-2 flex-wrap">
                {adviceBusy ? (
                  <>
                    <span className="text-sm text-gray-500">กำลังวิเคราะห์...</span>
                    <button type="button" className="btn-secondary text-red-600" onClick={abortAi}>
                      <StopCircle className="w-4 h-4 mr-2" /> หยุด
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-primary" onClick={askAi}>
                      <Sparkles className="w-4 h-4 mr-2" /> ขอคำแนะนำจาก AI
                    </button>
                    <button type="button" className="btn-secondary" onClick={redoAi} disabled={!lastContext}>
                      <RotateCcw className="w-4 h-4 mr-2" /> ส่งคำสั่งเดิมอีกครั้ง
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {!canUseAi && (
            <p className="text-sm text-gray-400">ฟีเจอร์ AI Assistant ไม่รวมอยู่ในแพ็กเกจของบริษัทนี้</p>
          )}
          {dirty && canUseAi && (
            <p className="text-xs text-amber-700">คำแนะนำจะอิงกับค่าที่กำลังแก้ไขอยู่ ซึ่งยังไม่ได้บันทึก</p>
          )}
          {adviceError && <div className="text-sm text-red-600">{adviceError}</div>}
          {advice && (
            <div className="space-y-2">
              <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-800">{advice}</div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="btn-secondary" onClick={() => copyText("current", advice)}>
                  <Copy className="w-4 h-4 mr-2" /> {copied === "current" ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
                <button type="button" className="btn-secondary" onClick={saveAdvice}>
                  <Bookmark className="w-4 h-4 mr-2" /> บันทึกคำตอบ
                </button>
              </div>
            </div>
          )}
          {savedAdvice.length > 0 && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">คำตอบที่บันทึกไว้ ({savedAdvice.length})</h3>
              {savedAdvice.map((s) => (
                <div key={s.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-gray-500">
                    <span>{s.title} · บันทึกเมื่อ {s.savedAt}</span>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary" onClick={() => copyText(s.id, s.reply)}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> {copied === s.id ? "คัดลอกแล้ว" : "คัดลอก"}
                      </button>
                      <button type="button" className="btn-secondary text-red-600" onClick={() => deleteSavedAdvice(s.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> ลบ
                      </button>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap max-h-64 overflow-y-auto text-sm text-gray-800">{s.reply}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
      {!error && rows.length > 0 && (
        <NetZeroPrintReport
          company={state.company}
          plan={draft}
          baselines={baselines}
          rows={rows}
          alerts={alerts}
          reportingYear={reportingYear}
          printedAt={new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
        />
      )}
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ใช้แปลงค่าของแต่ละ Scope ให้เป็นอ็อบเจกต์ใหม่ ตามลำดับ Scope
function mapScopes<T, U>(values: Record<ScopeKey, T>, f: (v: T) => U): Record<ScopeKey, U> {
  const out = {} as Record<ScopeKey, U>;
  for (const s of SCOPE_KEYS) out[s] = f(values[s]);
  return out;
}

function SummaryCard({ title, value, note, gap }: { title: string; value: number; note: string; gap?: number }) {
  return (
    <div className="panel text-center flex flex-col items-center justify-center gap-1">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-900">{formatNumber(value, 1)}</div>
      <div className="text-xs text-gray-500 mt-1">tCO2e · {note}</div>
      {gap !== undefined && (
        <div className={`text-xs font-semibold mt-1 ${gap > 0 ? "text-red-600" : "text-emerald-700"}`}>
          {gap > 0 ? `ยังขาดการลดอีก ${formatNumber(gap, 1)} tCO2e` : "แผนโครงการครอบคลุมเป้าหมาย"}
        </div>
      )}
    </div>
  );
}
