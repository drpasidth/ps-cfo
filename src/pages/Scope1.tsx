import React from "react";
import { useApp } from "../context/AppContext";
import { formatNumber } from "../utils/calculations";
import { getScope1EfOptions } from "../data/scope1Reference";
import { periodForYear, yearOf } from "../types";
import PeriodToggle from "../components/PeriodToggle";
import {
  Factory,
  Fuel,
  Truck,
  Snowflake,
  Plus,
  Trash2,
  Edit3,
  Calculator,
} from "lucide-react";

type SubCat = "stationary" | "mobile" | "fugitive";

const subCategories: Record<
  SubCat,
  { label: string; icon: React.ElementType; description: string }
> = {
  stationary: {
    label: "การเผาไหม้เชื้อเพลิงนิ่ง (Stationary Combustion)",
    icon: Fuel,
    description:
      "หม้อไอน้ำ เครื่องกำเนิดไฟฟ้า เตาเผา และอุปกรณ์เผาไหม้เชื้อเพลิงอื่นๆ",
  },
  mobile: {
    label: "การเผาไหม้เชื้อเพลิงเคลื่อนที่ (Mobile Combustion)",
    icon: Truck,
    description: "ยานพาหนะขององค์กร เช่น รถบรรทุก รถตู้ รถยนต์",
  },
  fugitive: {
    label: "การปล่อยทางรอยรั่ว (Fugitive Emissions)",
    icon: Snowflake,
    description:
      "สารทำความเย็นจากระบบปรับอากาศ ตู้เย็น ระบบดับเพลิง เป็นต้น",
  },
};

type ActivityFormData = {
  factorId: string;
  activityData: string;
  note: string;
  description: string;
  attachmentFiles: File[];
  month: string;
};

export default function Scope1() {
  const { state, dispatch, year } = useApp();
  const period = periodForYear(year, state.company);
  const [activeTab, setActiveTab] = React.useState<SubCat>("stationary");
  const [forms, setForms] = React.useState<Record<SubCat, ActivityFormData>>({
    stationary: { factorId: "", activityData: "", note: "", description: "", attachmentFiles: [], month: new Date().toISOString().slice(0, 7) },
    mobile: { factorId: "", activityData: "", note: "", description: "", attachmentFiles: [], month: new Date().toISOString().slice(0, 7) },
    fugitive: { factorId: "", activityData: "", note: "", description: "", attachmentFiles: [], month: new Date().toISOString().slice(0, 7) },
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showEntryModal, setShowEntryModal] = React.useState(false);
 const [previewImage, setPreviewImage] = React.useState<{ name: string; dataUrl: string } | null>(null);
  const [modalMode, setModalMode] = React.useState<"activity" | "monthly">("activity");
  const periodActivities = state.activities.filter((a) => yearOf(a, state.company) === year);
  const scope1Activities = periodActivities.filter((a) => a.scope === "scope1");

  // Factor options come from the EF Components table (saved edits + GWP100), read when the page mounts.
  const allFactors = React.useMemo(() => getScope1EfOptions(), []);

  const getForm = (key: SubCat): ActivityFormData => forms[key];

  const updateForm = (key: SubCat, field: keyof ActivityFormData, value: string) => {
    setForms((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent, key: SubCat) => {
    e.preventDefault();
    const form = getForm(key);
    const factor = allFactors.find((f) => f.id === form.factorId);
    if (!factor) return;

    // Step 1: create the activity definition first. Monthly quantity is entered later.
    if (!editingId && modalMode === "activity") {
      dispatch({ type: "ADD_ACTIVITY", payload: { scope: "scope1", subCategory: key, factorId: form.factorId, activityData: 0, unit: factor.unit, co2e: 0, note: form.note, description: form.description, attachments: [], month: "", period, year } });
      setForms((prev) => ({ ...prev, [key]: { ...prev[key], factorId: "", note: "", description: "" } }));
      setShowEntryModal(false);
      return;
    }
    if (!form.activityData) return;

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
          scope: "scope1",
          subCategory: key,
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
          scope: "scope1",
          subCategory: key,
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
    // Close only after validation and dispatch succeeded; invalid monthly entries remain visible.
    setShowEntryModal(false);
    setForms((prev) => ({
      ...prev,
      [key]: { factorId: "", activityData: "", note: "", description: "", attachmentFiles: [], month: new Date().toISOString().slice(0, 7) },
    }));
  };

  const startEdit = (record: any) => {
    setEditingId(record.id);
    setForms((prev) => ({
      ...prev,
      [record.subCategory as SubCat]: {
        factorId: record.factorId,
        activityData: String(record.activityData),
        note: record.note || "",
        description: record.description || "",
        attachmentFiles: [], month: record.month || new Date(record.date).toISOString().slice(0, 7),
      },
    }));
    setActiveTab(record.subCategory as SubCat);
  };

  const deleteRecord = (id: string) => {
    if (window.confirm("ลบรายการนี้ใช่หรือไม่?")) {
      dispatch({ type: "DELETE_ACTIVITY", payload: id });
    }
  };

  // Mobile combustion can use vehicle factors (per km / tkm) and fuel factors (per kg / m3)
  const factorsForTab = (key: SubCat) => allFactors.filter((f) => f.category === key);

  const catTotal = (key: SubCat) =>
    scope1Activities
      .filter((a) => a.subCategory === key)
      .reduce((sum, a) => sum + a.co2e, 0);

  const tabActivities = scope1Activities.filter(
    (a) => a.subCategory === activeTab
  );

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="w-6 h-6 text-orange-600" />
        <h1 className="text-2xl font-bold text-gray-900">ขอบเขตที่ 1 (Scope 1)</h1>
      </div>
      <p className="text-gray-600">
        การปล่อยก๊าซเรือนกระจกโดยตรงจากแหล่งปล่อยที่อยู่ภายใต้การควบคุมขององค์กร
      </p>
      <PeriodToggle />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="panel p-4 border-2 border-emerald-200 bg-emerald-50">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-emerald-700" />
            </div>
          </div>
          <p className="text-sm font-semibold text-emerald-800">การปล่อยก๊าซรวม Scope 1</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">
            {formatNumber(scope1Activities.reduce((sum, a) => sum + a.co2e, 0))} kgCO2e
          </p>
          <p className="text-xs text-emerald-700 mt-2">
            รวม {scope1Activities.length} รายการ (ทั้ง 3 หมวด)
          </p>
        </div>
        {(["stationary", "mobile", "fugitive"] as SubCat[]).map((key) => {
          const cat = subCategories[key];
          const total = catTotal(key);
          const catActs = scope1Activities.filter((a) => a.subCategory === key);
          return (
            <div key={key} className="panel p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <cat.icon className="w-5 h-5 text-orange-600" />
                </div>
                {editingId && key === activeTab ? (
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ยกเลิกแก้ไข
                  </button>
                ) : null}
              </div>
              <p className="text-sm font-medium text-gray-700">{cat.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(total)} kgCO2e
              </p>
              <p className="text-xs text-gray-500 mt-2">{catActs.length} รายการ</p>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(["stationary", "mobile", "fugitive"] as SubCat[]).map((key) => {
          const cat = subCategories[key];
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === key
                  ? "border-orange-600 text-orange-700 bg-orange-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form column */}
        <div className="lg:col-span-1 panel p-5 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              เพิ่มรายการกิจกรรม
            </h2>
          </div>
          {!showEntryModal && !editingId && <button type="button" onClick={() => { setModalMode("activity"); setShowEntryModal(true); }} className="btn-primary mb-4"><Plus className="w-4 h-4" /> เพิ่มรายการกิจกรรม</button>}
          <form onSubmit={(e) => { handleSubmit(e, activeTab); }} className={`${showEntryModal || editingId ? "fixed inset-0 z-50 m-auto max-w-lg h-fit bg-white rounded-xl shadow-2xl p-6 border" : "hidden"} space-y-3`}>
            <div className="flex justify-between items-center"><h2 className="text-lg font-bold">{editingId ? "แก้ไขรายการรายเดือน" : modalMode === "activity" ? "เพิ่มกิจกรรม" : "เพิ่มรายการรายเดือน"}</h2><button type="button" onClick={() => { setShowEntryModal(false); setEditingId(null); }} className="text-gray-500 text-xl">×</button></div>
            <div className={modalMode === "activity" ? "hidden" : ""}>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">เดือนที่บันทึกข้อมูล</label>
              <input type="month" value={getForm(activeTab).month} onChange={(e) => updateForm(activeTab, "month", e.target.value)} className="input" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">รายละเอียดกิจกรรม / วิธีการเก็บข้อมูล</label>
              <textarea value={getForm(activeTab).description} onChange={(e) => updateForm(activeTab, "description", e.target.value)} className="input" rows={3} placeholder="ระบุสถานที่ อุปกรณ์ ช่วงเวลา หรือแหล่งที่มาของข้อมูล" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                ปัจจัยการปล่อยก๊าซ
              </label>
              <select value={getForm(activeTab).factorId} onChange={(e) => updateForm(activeTab, "factorId", e.target.value)} className="input">
                <option value="">-- เลือกปัจจัย --</option>
                {factorsForTab(activeTab).map((f) => (
                  <option key={f.id} value={f.id}>{`${f.id} - ${f.name} (${formatNumber(f.factor)} kgCO2e/${f.unit})`}</option>
                ))}
              </select>
              {getForm(activeTab).factorId && (() => { const selected = allFactors.find((f) => f.id === getForm(activeTab).factorId); return selected ? <p className="text-xs text-emerald-700 mt-1">EF ({selected.id}): {formatNumber(selected.factor)} kgCO2e / {selected.unit}</p> : null; })()}
            </div>
            <div className={modalMode === "activity" ? "hidden" : ""}>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                ปริมาณกิจกรรม {getForm(activeTab).factorId ? factorsForTab(activeTab).find((f) => f.id === getForm(activeTab).factorId)?.unit || "" : ""}
              </label>
              <input type="number" step="any" value={getForm(activeTab).activityData} onChange={(e) => updateForm(activeTab, "activityData", e.target.value)} className="input" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">หมายเหตุ</label>
              <input value={getForm(activeTab).note} onChange={(e) => updateForm(activeTab, "note", e.target.value)} className="input" placeholder="เช่น หม้อไอน้ำหมายเลข 1" />
            </div>
            <div className={modalMode === "activity" ? "hidden" : ""}>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">เอกสารแนบ</label>
              <input type="file" multiple onChange={(e) => setForms((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], attachmentFiles: Array.from(e.target.files || []) } }))} className="input text-sm" accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.doc,.docx" />
              <p className="text-xs text-gray-400 mt-1">แนบใบเสร็จ ใบแจ้งหนี้ บิล หรือหลักฐานการวัด</p>
            </div>
            <button type="submit" className="btn-primary w-full">
              {editingId ? "บันทึกการแก้ไขรายการรายเดือน" : modalMode === "activity" ? "บันทึกกิจกรรม" : "บันทึกรายการประจำเดือน"}
              <Calculator className="w-4 h-4 ml-2" />
            </button>
          </form>
        </div>

        {/* List column */}
        <div className="lg:col-span-2 panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              รายการกิจกรรม{" "}
              <span className="text-gray-500 text-normal">
                - {subCategories[activeTab].label}
              </span>
            </h2>
            <p className="text-xs text-gray-500">
              รวม {formatNumber(catTotal(activeTab))} kgCO2e
            </p>
          </div>

          {tabActivities.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>ยังไม่มีรายการกิจกรรมในหมวดนี้</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(new Map(tabActivities.map((a) => [`${a.factorId}|${a.description || ""}|${a.note || ""}`, a])).values()).map((activity) => {
                const factor = allFactors.find((f) => f.id === activity.factorId);
                const monthly = tabActivities.filter((a) => a.activityData > 0 && a.factorId === activity.factorId && (a.description || "") === (activity.description || "") && (a.note || "") === (activity.note || ""));
                return (
                  <details key={activity.id} className="border border-gray-200 rounded-lg bg-white group">
                    <summary className="cursor-pointer list-none p-4 flex items-center justify-between hover:bg-gray-50">
                      <div><div className="font-semibold text-gray-800">{factor?.name || activity.factorId}</div><div className="text-xs text-gray-500">{activity.description || activity.note || "กิจกรรมไม่มีรายละเอียด"} · {monthly.length} เดือน</div></div>
                      <span className="flex items-center gap-2"><button type="button" title="ลบกิจกรรมนี้ทั้งหมด" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const group = tabActivities.filter((a) => a.factorId === activity.factorId && (a.description || "") === (activity.description || "") && (a.note || "") === (activity.note || "")); if (window.confirm(`ลบกิจกรรมนี้และรายการรายเดือนทั้งหมด ${group.length} รายการใช่หรือไม่?`)) { group.forEach((a) => dispatch({ type: "DELETE_ACTIVITY", payload: a.id })); } }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button><button type="button" onClick={(e) => { e.preventDefault(); setForms((p) => ({ ...p, [activeTab]: { ...p[activeTab], factorId: activity.factorId, description: activity.description || "", note: activity.note || "" } })); setModalMode("monthly"); setShowEntryModal(true); }} className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">+ เพิ่มเดือน/ปริมาณ</button><span className="text-xs text-emerald-600">ดูรายการรายเดือน ▾</span></span>
                    </summary>
                    <div className="overflow-x-auto border-t border-gray-100"><table className="table"><thead><tr><th>เดือน</th><th className="text-right">ปริมาณ</th><th>หน่วย</th><th className="text-right">EF</th><th className="text-right">CO2e (kg)</th><th>เอกสารแนบ</th><th>จัดการ</th></tr></thead><tbody>{monthly.sort((a,b) => (a.month || "").localeCompare(b.month || "")).map((a) => <tr key={a.id}><td>{a.month || "-"}</td><td className="text-right">{formatNumber(a.activityData)}</td><td>{a.unit}</td><td className="text-right text-gray-700">{factor ? `${formatNumber(factor.factor)} kgCO2e/${factor.unit}` : "-"}</td><td className="text-right text-emerald-700">{formatNumber(a.co2e)}</td><td>{a.attachments?.length ? <div className="flex flex-wrap gap-1">{a.attachments.map((file) => file.type?.startsWith("image/") ? <button key={file.name} type="button" onClick={() => setPreviewImage({ name: file.name, dataUrl: file.dataUrl })} className="text-xs text-emerald-700 underline hover:text-emerald-900" title="คลิกเพื่อดูรูป">🖼️ {file.name}</button> : <a key={file.name} href={file.dataUrl} download={file.name} className="text-xs text-blue-700 underline">📎 {file.name}</a>)}</div> : "-"}</td><td className="flex gap-1"><button onClick={() => startEdit(a)} className="p-1.5 text-gray-400 hover:text-emerald-600"><Edit3 className="w-4 h-4" /></button><button onClick={() => deleteRecord(a.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody></table></div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    {previewImage && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
      <div className="relative max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setPreviewImage(null)} className="absolute -right-3 -top-3 bg-white rounded-full w-8 h-8 text-gray-700 shadow">×</button>
        <img src={previewImage.dataUrl} alt={previewImage.name} className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain bg-white" />
        <p className="text-center text-white text-sm mt-2">{previewImage.name}</p>
      </div>
    </div>}
    </>
  );
}
