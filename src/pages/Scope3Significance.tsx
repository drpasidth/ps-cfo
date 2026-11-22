import React from "react";
import { useApp } from "../context/AppContext";
import { Save, CheckCircle, ClipboardCheck, Download } from "lucide-react";
import { downloadSignificanceCsv } from "../utils/assessmentExport";
import {
  buildScope3Rows,
  INFLUENCE_OPTIONS,
  RISK_OPTIONS,
  SCOPE3_CATEGORIES,
  DEFAULT_SCOPE3_ASSESSMENT,
} from "../utils/scope3Significance";
import type { Scope3Assessment } from "../types";
import { formatNumber } from "../utils/calculations";

type Draft = Record<string, { influence: 1 | 3 | 5; riskOpportunity: 1 | 3 | 5; remark: string }>;

export default function Scope3Significance() {
  const { state, dispatch } = useApp();
  const [saved, setSaved] = React.useState(false);

  const initialDraft = React.useMemo<Draft>(() => {
    const out: Draft = {};
    SCOPE3_CATEGORIES.forEach((c) => {
      const s: Scope3Assessment = { ...DEFAULT_SCOPE3_ASSESSMENT, ...state.company.scope3Significance?.[c.subCategory] };
      out[c.subCategory] = { influence: s.influence, riskOpportunity: s.riskOpportunity, remark: s.remark || "" };
    });
    return out;
    // Re-initialise only when the saved profile changes (e.g. after SQLite data loads)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.company.scope3Significance]);
  const [draft, setDraft] = React.useState<Draft>(initialDraft);
  React.useEffect(() => setDraft(initialDraft), [initialDraft]);

  // Preview rows use the draft values so the totals update while the user edits
  const previewCompany = React.useMemo(() => {
    const scope3Significance: Record<string, Scope3Assessment> = {};
    Object.entries(draft).forEach(([k, v]) => { scope3Significance[k] = v; });
    return { ...state.company, scope3Significance };
  }, [state.company, draft]);
  const rows = buildScope3Rows(previewCompany, state.activities);

  const update = (sub: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [sub]: { ...d[sub], ...patch } }));

  const save = () => {
    const scope3Significance: Record<string, Scope3Assessment> = {};
    Object.entries(draft).forEach(([k, v]) => { scope3Significance[k] = { ...v }; });
    dispatch({ type: "SET_COMPANY", payload: { scope3Significance } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reportingYear = state.company.reportingYear || "-";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">ประเมินความมีนัยสำคัญ Scope 3 (Fr-03.2)</h1>
      </div>
      <p className="text-gray-600 text-sm">
        ปริมาณการปล่อย (Magnitude) คำนวณอัตโนมัติจากข้อมูล Scope 3 ของปีที่รายงาน ({reportingYear}) ·
        เลือกคะแนนความสามารถในการลดและความเสี่ยง/โอกาสตามแนวทาง TGO ·
        น้ำหนัก: ปริมาณ 50% + ความสามารถในการลด 30% + ความเสี่ยง/โอกาส 20% · คะแนน &gt; 3 = มีนัยสำคัญ
      </p>

      <div className="panel p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">No</th>
              <th className="px-3 py-2 text-left">ประเภทย่อย (Category)</th>
              <th className="px-3 py-2 text-right">tCO2e</th>
              <th className="px-3 py-2 text-right">สัดส่วน %</th>
              <th className="px-3 py-2 text-center">Magnitude</th>
              <th className="px-3 py-2 text-left">Level of influence</th>
              <th className="px-3 py-2 text-left">Risk / Opportunity</th>
              <th className="px-3 py-2 text-center">คะแนนรวม</th>
              <th className="px-3 py-2 text-center">ผล</th>
              <th className="px-3 py-2 text-left">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.subCategory} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">{r.no}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.tCO2e, 2)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.sharePct, 1)}</td>
                <td className="px-3 py-2 text-center font-semibold">{r.magnitude}</td>
                <td className="px-3 py-2">
                  <select
                    className="input"
                    value={draft[r.subCategory]?.influence ?? 3}
                    onChange={(e) => update(r.subCategory, { influence: Number(e.target.value) as 1 | 3 | 5 })}
                  >
                    {INFLUENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="input"
                    value={draft[r.subCategory]?.riskOpportunity ?? 3}
                    onChange={(e) => update(r.subCategory, { riskOpportunity: Number(e.target.value) as 1 | 3 | 5 })}
                  >
                    {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-center font-semibold">{formatNumber(r.total, 2)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.significant ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {r.significant ? "มีนัยสำคัญ" : "ไม่มีนัยสำคัญ"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input"
                    value={draft[r.subCategory]?.remark ?? ""}
                    onChange={(e) => update(r.subCategory, { remark: e.target.value })}
                    placeholder={r.significant ? "" : "เหตุผลการยกเว้น (จำเป็น)"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save}>
          <Save className="w-4 h-4 mr-2" /> บันทึกการประเมิน
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadSignificanceCsv(previewCompany, state.activities)}
        >
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </button>
        {saved && (
          <span className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" /> บันทึกเรียบร้อยแล้ว
          </span>
        )}
      </div>
    </div>
  );
}
