import React from "react";
import { Save, RotateCcw, Table2 } from "lucide-react";
import {
  DEFAULT_SCOPE3_CRITERIA,
  resetScope3Criteria,
  setScope3Criteria,
  useScope3Criteria,
  type Scope3CriteriaTable,
  type Scope3Criterion,
} from "../data/scope3CriteriaTable";

export default function Scope3Criteria() {
  const saved = useScope3Criteria();
  const [draft, setDraft] = React.useState<Scope3CriteriaTable>(saved);
  const [message, setMessage] = React.useState("");

  // Keep the draft in sync when the saved table changes (e.g. after reset)
  React.useEffect(() => setDraft(saved), [saved]);

  const updateCriterion = (idx: number, patch: Partial<Scope3Criterion>) =>
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));

  const updateBand = (idx: number, band: number, value: string) =>
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c, i) => {
        if (i !== idx) return c;
        const bands = [...c.bands] as Scope3Criterion["bands"];
        bands[band] = value;
        return { ...c, bands };
      }),
    }));

  const totalWeight = draft.criteria.reduce((s, c) => s + (c.weight ?? 0), 0);

  const save = () => {
    setScope3Criteria(draft);
    setMessage("บันทึกแล้ว");
    setTimeout(() => setMessage(""), 2000);
  };

  const reset = () => {
    if (!window.confirm("คืนค่าตารางเป็นค่าต้นฉบับจาก PDF ใช่หรือไม่? การแก้ไขที่บันทึกไว้จะหายไป")) return;
    resetScope3Criteria();
    setDraft(DEFAULT_SCOPE3_CRITERIA);
    setMessage("คืนค่าเริ่มต้นแล้ว");
    setTimeout(() => setMessage(""), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Table2 className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ตาราง G: หลักเกณฑ์การให้คะแนนการคัดเลือก Scope 3</h1>
            <p className="text-gray-500 text-sm">อ้างอิง Report TGO Workshop.pdf หน้า 34 · แก้ไขได้ทุกช่อง</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> คืนค่าเดิม
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            <Save className="w-4 h-4 mr-2" /> บันทึก
          </button>
        </div>
      </div>
      {message && <div className="text-emerald-700 text-sm font-medium">{message}</div>}

      <div className="panel p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left w-48">ประเด็นที่ต้องพิจารณา</th>
              <th className="px-3 py-2 text-left w-64">ผลประเมิน / เกณฑ์วัด</th>
              <th className="px-3 py-2 text-center w-24">น้ำหนัก (%)</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} className="px-3 py-2 text-center">ระดับ {n}</th>
              ))}
              <th className="px-3 py-2 text-left">กฎเฉพาะ</th>
            </tr>
          </thead>
          <tbody>
            {draft.criteria.map((c, idx) => (
              <tr key={c.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <input className="input" value={c.name} onChange={(e) => updateCriterion(idx, { name: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <textarea className="input" rows={2} value={c.basis} onChange={(e) => updateCriterion(idx, { basis: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input text-center"
                    type="number"
                    value={c.weight ?? ""}
                    placeholder="-"
                    onChange={(e) => updateCriterion(idx, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </td>
                {c.bands.map((b, bi) => (
                  <td key={bi} className="px-3 py-2">
                    <input className="input" value={b} onChange={(e) => updateBand(idx, bi, e.target.value)} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <input className="input" value={c.rule ?? ""} onChange={(e) => updateCriterion(idx, { rule: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 text-gray-700">
            <tr className="border-t border-gray-200">
              <td className="px-3 py-2 font-semibold" colSpan={2}>รวมน้ำหนัก</td>
              <td className={`px-3 py-2 text-center font-semibold ${totalWeight === 100 ? "" : "text-red-600"}`}>{totalWeight}</td>
              <td colSpan={6} className="px-3 py-2 text-xs text-gray-500">
                {totalWeight === 100 ? "น้ำหนักรวมครบ 100%" : "น้ำหนักรวมไม่เท่ากับ 100%"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="panel space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">เกณฑ์ตัดสิน (คะแนน ≥)</label>
          <input
            className="input w-24 text-center"
            type="number"
            step="0.1"
            value={draft.threshold}
            onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))}
          />
        </div>
        <textarea
          className="input"
          rows={2}
          value={draft.thresholdNote}
          onChange={(e) => setDraft((d) => ({ ...d, thresholdNote: e.target.value }))}
        />
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">หมายเหตุจากต้นฉบับ</div>
          {draft.sourceNotes.map((n, i) => (
            <textarea
              key={i}
              className="input mb-2"
              rows={2}
              value={n}
              onChange={(e) =>
                setDraft((d) => ({ ...d, sourceNotes: d.sourceNotes.map((x, j) => (j === i ? e.target.value : x)) }))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
