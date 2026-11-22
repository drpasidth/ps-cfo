import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Gauge, Save, Download, CheckCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import PeriodToggle from "../components/PeriodToggle";
import { downloadUncertaintyCsv } from "../utils/assessmentExport";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_SCORE,
  EF_OPTIONS,
  SCOPE_LABEL,
  UNCERTAINTY_LEVELS,
  buildUncertaintyItems,
  clearUncertaintyScores,
  saveUncertaintyScores,
  useUncertaintyScores,
  type UncertaintyScore,
} from "../data/uncertainty";

const LEVEL_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-700",
  2: "bg-amber-100 text-amber-700",
  3: "bg-emerald-100 text-emerald-700",
  4: "bg-emerald-200 text-emerald-800",
};

export default function UncertaintyAssessment() {
  const { state, year } = useApp();
  const stored = useUncertaintyScores();

  // ค่าที่กำลังแก้ไขในหน้า (ยังไม่บันทึก) จะถูกบันทึกลงฐานข้อมูลของบริษัทเมื่อกดปุ่มบันทึก
  const [draft, setDraft] = useState<Record<string, UncertaintyScore>>(stored);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(stored), [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  const items = useMemo(
    () => buildUncertaintyItems(state.activities, state.company, state.factors, year, draft),
    [state.activities, state.company, state.factors, year, draft],
  );

  const countByLevel = UNCERTAINTY_LEVELS.map((l) => ({
    ...l,
    count: items.filter((r) => r.level?.level === l.level).length,
  }));

  const setScore = (key: string, patch: Partial<UncertaintyScore>) => {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? DEFAULT_SCORE), ...patch } }));
    setSaved(false);
  };

  const save = () => {
    saveUncertaintyScores(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exportCsv = () => {
    downloadUncertaintyCsv(state.activities, state.company, state.factors, year, draft);
  };

  const reset = () => {
    if (!window.confirm("ล้างคะแนนที่กรอกทั้งหมดและคืนค่าเริ่มต้น (A=3, B=3) ใช่หรือไม่?")) return;
    clearUncertaintyScores();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Gauge className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">การประเมินความไม่แน่นอน (Uncertainty)</h1>
            <p className="text-gray-500 text-sm">
              อ้างอิง Report TGO Workshop.pdf หน้า 30–31 · คะแนนรวม = A (ข้อมูลกิจกรรม) × B (ค่า EF) · ปี {year}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="btn-secondary" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> ล้างคะแนนทั้งหมด
          </button>
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={!dirty}>
            <Save className="w-4 h-4 mr-2" /> บันทึกการประเมิน
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-700 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> บันทึกเรียบร้อยแล้ว
            </span>
          )}
          {!saved && dirty && <span className="text-amber-600 text-sm">มีการแก้ไขที่ยังไม่บันทึก</span>}
        </div>
      </div>

      <PeriodToggle />

      {/* เกณฑ์ (หน้า 30) */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="panel">
          <h2 className="font-semibold text-gray-800 mb-2">ระดับคะแนนอ้างอิงคุณภาพข้อมูล</h2>
          <ul className="text-sm space-y-1">
            {ACTIVITY_OPTIONS.map((o) => (
              <li key={o.value}>ข้อมูลกิจกรรม: {o.label}</li>
            ))}
            {EF_OPTIONS.map((o) => (
              <li key={o.value}>ค่า EF: {o.label}</li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2 className="font-semibold text-gray-800 mb-2">ระดับผลรวมและความหมาย</h2>
          <table className="w-full text-sm">
            <thead className="text-gray-600">
              <tr>
                <th className="text-left py-1">ระดับ</th>
                <th className="text-left py-1">คะแนนรวม</th>
                <th className="text-left py-1">คำอธิบาย</th>
                <th className="text-right py-1">จำนวนรายการ</th>
              </tr>
            </thead>
            <tbody>
              {countByLevel.map((l) => (
                <tr key={l.level} className="border-t border-gray-100">
                  <td className="py-1">{l.level}</td>
                  <td className="py-1">{l.min}–{l.max}</td>
                  <td className="py-1">{l.description} · {l.quality}</td>
                  <td className="py-1 text-right">{l.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ตารางกรอกผล: รายการจริงจากกิจกรรมที่บันทึกไว้ */}
      <div className="panel p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left w-28">ประเภท</th>
              <th className="px-3 py-2 text-left min-w-[260px]">รายการ</th>
              <th className="px-3 py-2 text-center w-20">จำนวนเดือน</th>
              <th className="px-3 py-2 text-left w-72">คะแนนการเก็บข้อมูล (A)</th>
              <th className="px-3 py-2 text-left w-72">คะแนนค่า EF (B)</th>
              <th className="px-3 py-2 text-center w-20">A×B</th>
              <th className="px-3 py-2 text-center w-28">ระดับคุณภาพ</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการกิจกรรมในปีนี้ กรุณาบันทึกกิจกรรมในหน้า Scope 1/2/3 ก่อน
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.key} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{SCOPE_LABEL[item.scope] || item.scope}</div>
                  <div className="text-xs text-gray-500">{item.subCategory}</div>
                </td>
                <td className="px-3 py-2 whitespace-pre-wrap break-words">
                  <div className="font-medium">{item.factorName}</div>
                  {(item.description || item.note) && (
                    <div className="text-xs text-gray-500">
                      {[item.description, item.note].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{item.months}</td>
                <td className="px-3 py-2">
                  <select
                    className="input"
                    value={item.activityScore}
                    onChange={(e) => setScore(item.key, { activityScore: Number(e.target.value) })}
                  >
                    {ACTIVITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="input"
                    value={item.efScore}
                    onChange={(e) => setScore(item.key, { efScore: Number(e.target.value) })}
                  >
                    {EF_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-center font-semibold">{item.score}</td>
                <td className="px-3 py-2 text-center">
                  {item.level ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${LEVEL_COLORS[item.level.level]}`}>
                      ระดับ {item.level.level}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
