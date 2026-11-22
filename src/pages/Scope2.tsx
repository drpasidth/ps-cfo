import React from "react";
import { useApp } from "../context/AppContext";
import { SCOPE2_ELECTRICITY } from "../data/emissionFactors";
import { calculateTotals, formatNumber } from "../utils/calculations";
import { periodForYear, yearOf } from "../types";
import PeriodToggle from "../components/PeriodToggle";
import {
  Zap,
  Plus,
  Trash2,
  Edit3,
  Calculator,
  FileText,
} from "lucide-react";

type ActivityFormData = {
  factorId: string;
  activityData: string;
  note: string;
  description: string;
  attachmentFiles: File[];
  month: string;
};

export default function Scope2() {
  const { state, dispatch, year } = useApp();
  const period = periodForYear(year, state.company);
  const [form, setForm] = React.useState<ActivityFormData>({
    factorId: "",
    activityData: "",
    note: "",
    description: "",
    attachmentFiles: [], month: new Date().toISOString().slice(0, 7),
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const periodActivities = state.activities.filter((a) => yearOf(a, state.company) === year);
  const result = calculateTotals(periodActivities);
  const scope2Activities = periodActivities.filter((a) => a.scope === "scope2");
  const allFactors = React.useMemo(() => [...SCOPE2_ELECTRICITY], []);

  const updateForm = (field: keyof ActivityFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const factor = allFactors.find((f) => f.id === form.factorId);
    if (!factor || !form.activityData) return;

    const ad = parseFloat(form.activityData);
    if (isNaN(ad) || ad <= 0) return;

    const co2e = ad * factor.factor;
    const attachments = await Promise.all(form.attachmentFiles.map((file) => new Promise<{ name: string; type: string; size: number; dataUrl: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));

    if (editingId) {
      dispatch({
        type: "UPDATE_ACTIVITY",
        payload: {
          id: editingId,
          scope: "scope2",
          subCategory: "electricity",
          factorId: form.factorId,
          activityData: ad,
          unit: factor.unit,
          co2e,
          note: form.note,
          description: form.description,
          attachments,
          month: form.month,
          period,
          year,
        },
      });
      setEditingId(null);
    } else {
      dispatch({
        type: "ADD_ACTIVITY",
        payload: {
          scope: "scope2",
          subCategory: "electricity",
          factorId: form.factorId,
          activityData: ad,
          unit: factor.unit,
          co2e,
          note: form.note,
          description: form.description,
          attachments,
          month: form.month,
          period,
          year,
        },
      });
    }
    setForm({ factorId: "", activityData: "", note: "", description: "", attachmentFiles: [], month: new Date().toISOString().slice(0, 7) });
  };

  const startEdit = (record: any) => {
    setEditingId(record.id);
    setForm({
      factorId: record.factorId,
      activityData: String(record.activityData),
      note: record.note || "",
      description: record.description || "",
      attachmentFiles: [], month: record.month || new Date(record.date).toISOString().slice(0, 7),
    });
  };

  const deleteRecord = (id: string) => {
    if (window.confirm("ลบรายการนี้ใช่หรือไม่?")) {
      dispatch({ type: "DELETE_ACTIVITY", payload: id });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Zap className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">ขอบเขตที่ 2 (Scope 2)</h1>
      </div>
      <p className="text-gray-600">
        การปล่อยก๊าซเรือนกระจกทางอ้อมจากการซื้อไฟฟ้ามาใช้องค์กร
        (การปล่อยเกิดขึ้นที่โรงไฟฟ้า ไม่ใช่ที่องค์กร)
      </p>
      <PeriodToggle />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            {editingId ? (
              <button
                onClick={() => setEditingId(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ยกเลิกแก้ไข
              </button>
            ) : null}
          </div>
          <p className="text-sm font-medium text-gray-700">
            การปล่อยก๊าซ Scope 2 รวม
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatNumber(result.scope2.rawTotal)} kgCO2e
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {scope2Activities.length} รายการ
          </p>
        </div>
        <div className="panel p-4 bg-blue-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              ค่า Emission Factor ไฟฟ้า (grid mix)
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {SCOPE2_ELECTRICITY[0].factor} kgCO2e / kWh
          </p>
          <p className="text-xs text-gray-500 mt-1">
            TGO National LCI Database (ปี 2016-2018)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form column */}
        <div className="lg:col-span-1 panel p-5 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              เพิ่มรายการไฟฟ้า
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">เดือนที่บันทึกข้อมูล</label>
              <input type="month" value={form.month} onChange={(e) => updateForm("month", e.target.value)} className="input" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                ปัจจัยการปล่อยก๊าซ
              </label>
              <select
                value={form.factorId}
                onChange={(e) => updateForm("factorId", e.target.value)}
                className="input"
              >
                <option value="">-- เลือกแหล่งไฟฟ้า --</option>
                {allFactors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.factor} {f.unit})
                  </option>
                ))}
              </select>
              {form.factorId && (() => { const selected = allFactors.find((f) => f.id === form.factorId); return selected ? <p className="text-xs text-blue-700 mt-1">EF: {selected.factor} kgCO2e / {selected.unit}</p> : null; })()}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                ปริมาณการใช้ไฟฟ้า ({form.factorId ? allFactors.find((f) => f.id === form.factorId)?.unit || "" : ""})
              </label>
              <input
                type="number"
                step="any"
                value={form.activityData}
                onChange={(e) => updateForm("activityData", e.target.value)}
                className="input"
                placeholder="เช่น 15000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">หมายเหตุ</label>
              <input value={form.note} onChange={(e) => updateForm("note", e.target.value)} className="input" placeholder="เช่น ไฟฟ้าจากการไฟฟ้าฝ่ายผลิต" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">รายละเอียดกิจกรรม / แหล่งข้อมูล</label>
              <textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} className="input" rows={3} placeholder="ระบุเดือน อาคาร มิเตอร์ หรือวิธีการอ่านค่าจากบิล" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">เอกสารแนบ</label>
              <input type="file" multiple onChange={(e) => setForm((prev) => ({ ...prev, attachmentFiles: Array.from(e.target.files || []) }))} className="input text-sm" accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.doc,.docx" />
              <p className="text-xs text-gray-400 mt-1">แนบบิลค่าไฟ ใบแจ้งหนี้ หรือหลักฐานการใช้ไฟฟ้า</p>
            </div>
            <button type="submit" className="btn-primary w-full">
              {editingId ? "บันทึกการแก้ไขรายการประจำเดือน" : "บันทึกรายการประจำเดือน"}
              <Calculator className="w-4 h-4 ml-2" />
            </button>
          </form>
        </div>

        {/* List column */}
        <div className="lg:col-span-2 panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              รายการการใช้ไฟฟ้า
            </h2>
            <p className="text-xs text-gray-500">
              รวม {formatNumber(scope2Activities.reduce((s, a) => s + a.co2e, 0))} kgCO2e
            </p>
          </div>

          {scope2Activities.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>ยังไม่มีข้อมูลการใช้ไฟฟ้า</p>
              <p className="text-xs mt-1">
                เริ่มต้นโดยกรอกจำนวนหน่วยไฟฟ้า (kWh) จากบิลค่าไฟฟ้า
              </p>
            </div>
          ) : (
            <div className="space-y-3">{Array.from(new Map(scope2Activities.map((a) => [`${a.factorId}|${a.description || ""}|${a.note || ""}`, a])).values()).map((activity) => { const factor = allFactors.find((f) => f.id === activity.factorId); const monthly = scope2Activities.filter((a) => a.factorId === activity.factorId && (a.description || "") === (activity.description || "") && (a.note || "") === (activity.note || "")); return <details key={activity.id} className="border border-gray-200 rounded-lg bg-white"><summary className="cursor-pointer list-none p-4 flex justify-between"><div><div className="font-semibold">{factor?.name || activity.factorId}</div><div className="text-xs text-gray-500">{activity.description || activity.note || "กิจกรรมไม่มีรายละเอียด"} · {monthly.length} เดือน</div></div><span className="text-xs text-blue-600">ดูรายการรายเดือน ▾</span></summary><div className="overflow-x-auto border-t"><table className="table"><thead><tr><th>เดือน</th><th className="text-right">ปริมาณ</th><th className="text-right">EF</th><th className="text-right">CO2e (kg)</th><th>เอกสารแนบ</th><th>จัดการ</th></tr></thead><tbody>{monthly.sort((a,b) => (a.month || "").localeCompare(b.month || "")).map((a) => <tr key={a.id}><td>{a.month || "-"}</td><td className="text-right">{formatNumber(a.activityData)} {a.unit}</td><td className="text-right text-gray-700">{factor ? `${formatNumber(factor.factor)} kgCO2e/${factor.unit}` : "-"}</td><td className="text-right text-blue-700">{formatNumber(a.co2e)}</td><td>{a.attachments?.length ? `${a.attachments.length} ไฟล์` : "-"}</td><td className="flex gap-1"><button onClick={() => startEdit(a)} className="p-1.5"><Edit3 className="w-4 h-4" /></button><button onClick={() => deleteRecord(a.id)} className="p-1.5"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody></table></div></details>; })}</div>
          )}
        </div>
      </div>
    </div>
  );
}
