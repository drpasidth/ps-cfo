import React from "react";
import { useApp } from "../context/AppContext";
import { calculateTotals, formatNumber } from "../utils/calculations";
import { periodForYear, yearOf, type ActivityRecord } from "../types";
import PeriodToggle from "../components/PeriodToggle";
import {
  SCOPE3_CATEGORY_LABELS,
  SCOPE3_CATEGORY_ORDER,
  scope3CategoryOf,
  scope3FactorsFor,
  type Scope3Category,
  type Scope3Factor,
} from "../data/scope3Reference";
import { useScope3Factors } from "../data/scope3Store";
import { Truck, Plus, Trash2, Edit3, Calculator, FileText, ShoppingCart, HelpCircle } from "lucide-react";
import Scope3GuideModal from "../components/Scope3GuideModal";

// One form for all categories. The category dropdown drives the header and the EF options.
// Category 1 (purchased goods) shows the purchase fields (product, supplier);
// other categories show the activity fields (note, description).
type FormData = {
  category: Scope3Category;
  factorId: string;
  activityData: string;
  productName: string; // purchase only
  supplier: string; // purchase only (saved as note)
  description: string; // activity only
  note: string; // activity only
  attachmentFiles: File[];
  month: string;
};

const PURCHASED_GOODS = "purchased_goods";

const emptyForm = (): FormData => ({
  category: SCOPE3_CATEGORY_ORDER[1] ?? SCOPE3_CATEGORY_ORDER[0],
  factorId: "",
  activityData: "",
  productName: "",
  supplier: "",
  description: "",
  note: "",
  attachmentFiles: [],
  month: new Date().toISOString().slice(0, 7),
});

const CATEGORY_ORDER = SCOPE3_CATEGORY_ORDER;

// Options grouped by category, narrowed by the search text.
function CfpOptions({ query, factors }: { query: string; factors: Scope3Factor[] }) {
  const q = query.trim().toLowerCase();
  const matches = factors.filter((f) => !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  return (
    <>
      {CATEGORY_ORDER.map((cat) => {
        const items = matches.filter((f) => f.category === cat);
        if (items.length === 0) return null;
        return (
          <optgroup key={cat} label={SCOPE3_CATEGORY_LABELS[cat]}>
            {items.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.factor} kgCO2e/{f.unit})
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

export default function Scope3() {
  const { state, dispatch, year } = useApp();
  const period = periodForYear(year, state.company);
  const factors = useScope3Factors();
  const [form, setForm] = React.useState<FormData>(emptyForm);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [efSearch, setEfSearch] = React.useState("");
  const [guideCategory, setGuideCategory] = React.useState<Scope3Category | null>(null);

  const isPurchase = form.category === PURCHASED_GOODS;
  const eligibleFactors = scope3FactorsFor(form.category, factors);

  const periodActivities = state.activities.filter((a) => yearOf(a, state.company) === year);
  const result = calculateTotals(periodActivities);
  const scope3Activities = periodActivities.filter((a) => (a.scope as string) === "scope3");
  const scope3Total = scope3Activities.reduce((s, a) => s + a.co2e, 0);

  const updateForm = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Choosing a category changes the header and the EF options; the previous EF is cleared.
  const changeCategory = (category: Scope3Category) => {
    setForm((prev) => ({ ...prev, category, factorId: "" }));
    setEfSearch("");
  };

  // Clicking a category group in the list selects it in the form.
  const selectCategoryFromList = (category: Scope3Category) => {
    setEditingId(null);
    changeCategory(category);
  };

  const resetForm = () => {
    setEditingId(null);
    setEfSearch("");
    setForm((prev) => ({ ...emptyForm(), category: prev.category }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const factor = eligibleFactors.find((f) => f.id === form.factorId);
    if (!factor || !form.activityData) return;
    const ad = parseFloat(form.activityData);
    if (isNaN(ad) || ad <= 0) return;
    if (isPurchase && !form.productName.trim()) return;

    const attachments = await Promise.all(
      form.attachmentFiles.map(
        (file) =>
          new Promise<{ name: string; type: string; size: number; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );

    const payload = {
      scope: "scope3" as const,
      subCategory: form.category,
      factorId: factor.id,
      activityData: ad,
      unit: factor.unit,
      co2e: ad * factor.factor,
      note: isPurchase ? form.supplier : form.note,
      description: isPurchase ? form.productName.trim() : form.description,
      attachments,
      month: form.month,
      period,
      year,
      entryType: (isPurchase ? "purchase" : "activity") as "purchase" | "activity",
    };

    if (editingId) {
      dispatch({ type: "UPDATE_ACTIVITY", payload: { id: editingId, ...payload } });
    } else {
      dispatch({ type: "ADD_ACTIVITY", payload });
    }
    resetForm();
  };

  const startEdit = (record: ActivityRecord) => {
    const purchase = record.entryType === "purchase";
    setEditingId(record.id);
    setEfSearch("");
    setForm({
      category: scope3CategoryOf(record, factors),
      factorId: record.factorId,
      activityData: String(record.activityData),
      productName: purchase ? record.description || "" : "",
      supplier: purchase ? record.note || "" : "",
      description: purchase ? "" : record.description || "",
      note: purchase ? "" : record.note || "",
      attachmentFiles: [],
      month: record.month || new Date(record.date).toISOString().slice(0, 7),
    });
  };

  const deleteRecord = (id: string) => {
    if (window.confirm("ลบรายการนี้ใช่หรือไม่?")) {
      dispatch({ type: "DELETE_ACTIVITY", payload: id });
    }
  };

  const selectedFactor = eligibleFactors.find((f) => f.id === form.factorId);
  const qty = parseFloat(form.activityData);
  const co2ePreview = selectedFactor && !isNaN(qty) ? qty * selectedFactor.factor : 0;
  // The form header follows the selected category.
  const formHeaderCategory = form.category;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">ขอบเขตที่ 3 (Scope 3)</h1>
      </div>
      <p className="text-gray-600">
        การปล่อยก๊าซเรือนกระจกทางอ้อมอื่นๆ ในห่วงโซ่คุณค่า เช่น การเดินทาง การซื้อสินค้า ของเสีย และน้ำ
      </p>
      <PeriodToggle />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel p-4">
          <p className="text-sm font-medium text-gray-700">การปล่อยก๊าซ Scope 3 รวม</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(scope3Total)} kgCO2e</p>
          <p className="text-xs text-gray-500 mt-2">{scope3Activities.length} รายการ</p>
        </div>
        <div className="panel p-4 bg-purple-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-purple-800">ค่า EF Scope 3 จาก CFP table (EF_Scope3_V1)</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            ค่า EF ตรงตามไฟล์ EF_Scope3_V1.csv แต่ยังไม่ได้ตรวจสอบซ้ำกับแหล่งอ้างอิงต้นทาง ก่อนใช้รายงานจริงควรตรวจสอบค่า EF
          </p>
          <p className="text-xs text-gray-500 mt-1">รวมทุกขอบเขตในช่วงนี้: {formatNumber(result.grandTotalRaw)} kgCO2e (S1+S2+S3)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry form */}
        <div className="lg:col-span-1">
          <div className="panel p-5 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              {isPurchase ? <ShoppingCart className="w-4 h-4 text-purple-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? "แก้ไขรายการ: " : ""}
                {formHeaderCategory
                  ? SCOPE3_CATEGORY_LABELS[formHeaderCategory]
                  : isPurchase
                    ? "บันทึกรายการซื้อสินค้า"
                    : "เพิ่มรายการ Scope 3"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  {isPurchase ? "เดือนที่ซื้อ" : "เดือนที่บันทึกข้อมูล"}
                </label>
                <input type="month" value={form.month} onChange={(e) => updateForm("month", e.target.value)} className="input" required />
              </div>

              {isPurchase && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">ชื่อสินค้า / วัตถุดิบที่ซื้อ</label>
                  <input value={form.productName} onChange={(e) => updateForm("productName", e.target.value)} className="input" required />
                </div>
              )}

              <div>
                <div className="flex items-center justify-end mb-1">
                  <button
                    type="button"
                    title="วิธีบันทึกรายการของหมวดนี้"
                    aria-label="วิธีบันทึกรายการของหมวดนี้"
                    onClick={() => setGuideCategory(form.category)}
                    className="text-gray-400 hover:text-purple-700"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  {isPurchase ? "ค้นหา EF (หมวด 1)" : "ค้นหา EF ในหมวดนี้"}
                </label>
                <input
                  value={efSearch}
                  onChange={(e) => setEfSearch(e.target.value)}
                  className="input mb-1"
                  placeholder={isPurchase ? "พิมพ์ชื่อวัตถุดิบ เช่น PET, กระดาษ" : "พิมพ์ชื่อหรือรหัส เช่น ดีเซล, S3"}
                />
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  {isPurchase ? "EF วัตถุดิบ / สินค้า" : "ประเภทกิจกรรม / EF"}
                </label>
                <select value={form.factorId} onChange={(e) => updateForm("factorId", e.target.value)} className="input" required>
                  <option value="">{isPurchase ? "-- เลือก EF จาก CFP table --" : "-- เลือกประเภทกิจกรรม --"}</option>
                  <CfpOptions query={efSearch} factors={eligibleFactors} />
                </select>
                {selectedFactor && (
                  <p className="text-xs text-purple-700 mt-1">
                    EF: {selectedFactor.factor} kgCO2e / {selectedFactor.unit}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  ปริมาณ{isPurchase ? "ที่ซื้อ" : "กิจกรรม"} ({selectedFactor?.unit || (isPurchase ? "หน่วย" : "")})
                </label>
                <input type="number" step="any" value={form.activityData} onChange={(e) => updateForm("activityData", e.target.value)} className="input" placeholder="เช่น 500" required />
              </div>

              {isPurchase ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">ผู้ขาย / หมายเหตุ</label>
                  <input value={form.supplier} onChange={(e) => updateForm("supplier", e.target.value)} className="input" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">หมายเหตุ</label>
                    <input value={form.note} onChange={(e) => updateForm("note", e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">รายละเอียดกิจกรรม / แหล่งข้อมูล</label>
                    <textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} className="input" rows={3} placeholder="ระบุแหล่งข้อมูล เช่น ใบเสร็จ รายงานการเดินทาง" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">เอกสารแนบ</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setForm((prev) => ({ ...prev, attachmentFiles: Array.from(e.target.files || []) }))}
                  className="input text-sm"
                  accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.doc,.docx"
                />
              </div>

              {isPurchase && (
                <p className="text-sm text-gray-700">
                  CO2e คำนวณได้: <span className="font-semibold text-purple-700">{formatNumber(co2ePreview)} kgCO2e</span>
                </p>
              )}

              <div className="flex gap-2">
                <button type="submit" className="btn-primary w-full">
                  {editingId ? "บันทึกการแก้ไข" : isPurchase ? "บันทึกรายการซื้อสินค้า" : "บันทึกรายการประจำเดือน"}
                  <Calculator className="w-4 h-4 ml-2" />
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} className="text-xs text-gray-500 hover:text-gray-700 px-2">
                    ยกเลิก
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {guideCategory && (
          <Scope3GuideModal
            category={guideCategory}
            efCount={factors.filter((f) => f.category === guideCategory).length}
            onClose={() => setGuideCategory(null)}
          />
        )}

        {/* List grouped by category */}
        <div className="lg:col-span-2 panel p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">รายการ Scope 3</h2>
          <div className="space-y-3">
            {CATEGORY_ORDER.map((cat) => {
              const acts = scope3Activities.filter((a) => scope3CategoryOf(a, factors) === cat);
              const catSum = acts.reduce((s, a) => s + a.co2e, 0);
              const efOptions = scope3FactorsFor(cat, factors).length;
              const hasEf = efOptions > 0;
              return (
                <details
                  key={cat}
                  className={`rounded-lg bg-white ${hasEf ? "border-2 border-emerald-400" : "border border-gray-200"}`}
                  open={acts.length > 0}
                >
                  <summary
                    className={`cursor-pointer list-none p-4 flex justify-between items-center ${hasEf ? "bg-emerald-50" : ""}`}
                    onClick={() => selectCategoryFromList(cat)}
                    title="คลิกเพื่อเลือกหมวดนี้ในฟอร์ม"
                  >
                    <span className="font-semibold flex items-center gap-2">
                      {SCOPE3_CATEGORY_LABELS[cat]}
                      {hasEf && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
                          มี EF {efOptions} รายการ
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-purple-700">
                        {acts.length === 0 ? "ยังไม่มีรายการ" : `${formatNumber(catSum)} kgCO2e · ${acts.length} รายการ`}
                      </span>
                      <button
                        type="button"
                        title="วิธีบันทึกรายการของหมวดนี้"
                        aria-label="วิธีบันทึกรายการของหมวดนี้"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setGuideCategory(cat);
                        }}
                        className="text-gray-400 hover:text-purple-700"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </span>
                  </summary>
                  {acts.length > 0 && (
                    <div className="overflow-x-auto border-t">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>เดือน</th>
                            <th>ประเภท</th>
                            <th className="text-right">ปริมาณ</th>
                            <th className="text-right">CO2e (kg)</th>
                            <th>จัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {acts
                            .slice()
                            .sort((a, b) => (a.month || "").localeCompare(b.month || ""))
                            .map((a) => {
                              const f = factors.find((x) => x.id === a.factorId);
                              const isPurchaseRecord = a.entryType === "purchase";
                              return (
                                <tr key={a.id}>
                                  <td>{a.month || "-"}</td>
                                  <td>
                                    {isPurchaseRecord ? (
                                      <>
                                        <span className="text-xs bg-purple-100 text-purple-700 rounded px-1 mr-1">ซื้อสินค้า</span>
                                        {a.description || "-"}
                                        <div className="text-xs text-gray-500">EF: {f?.name || a.factorId}</div>
                                      </>
                                    ) : (
                                      f?.name || a.factorId
                                    )}
                                  </td>
                                  <td className="text-right">{formatNumber(a.activityData)} {a.unit}</td>
                                  <td className="text-right text-purple-700">{formatNumber(a.co2e)}</td>
                                  <td className="flex gap-1">
                                    <button onClick={() => startEdit(a)} className="p-1.5 text-gray-400 hover:text-emerald-600"><Edit3 className="w-4 h-4" /></button>
                                    <button onClick={() => deleteRecord(a.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
