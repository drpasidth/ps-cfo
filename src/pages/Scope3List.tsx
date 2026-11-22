import { useMemo, useState } from "react";
import { ClipboardList, Upload, Download, Plus, Pencil, Trash2, Check, X, RotateCcw } from "lucide-react";
import {
  SCOPE3_CATEGORY_LABELS,
  SCOPE3_CATEGORY_ORDER,
  classifyCfpItem,
  type Scope3Category,
  type Scope3Factor,
} from "../data/scope3Reference";
import { useScope3Factors, setScope3Factors, resetScope3Factors } from "../data/scope3Store";
import { parseCsv, csvEscape, downloadText } from "../utils/csv";
import { formatNumber } from "../utils/calculations";

// Table of CFP emission factors used for Scope 3. Initial data = public/EF_Scope3_V1.csv.
// Columns of the CSV: itemNo, item, unit, ef, reference, category (category optional)

interface Draft {
  name: string;
  unit: string;
  factor: string;
  category: Scope3Category;
  source: string;
}

const toDraft = (f: Scope3Factor): Draft => ({
  name: f.name,
  unit: f.unit,
  factor: String(f.factor),
  category: f.category,
  source: f.source,
});

const nextId = (list: Scope3Factor[]) => {
  const max = list.reduce((m, f) => {
    const n = parseInt(f.id.replace(/^CFP-/, ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `CFP-${max + 1}`;
};

function validateDraft(d: Draft): string | null {
  if (!d.name.trim()) return "กรุณาระบุชื่อรายการ";
  if (!d.unit.trim()) return "กรุณาระบุหน่วย";
  const v = Number(d.factor);
  if (d.factor.trim() === "" || !Number.isFinite(v) || v < 0) return "EF ต้องเป็นตัวเลขที่ไม่ติดลบ";
  return null;
}

function parseTable(text: string, fileName: string): { items: Scope3Factor[]; errors: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], errors: ["ไฟล์ไม่มีข้อมูล"] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const iNo = col("itemno"), iItem = col("item"), iUnit = col("unit"), iEf = col("ef");
  const iRef = col("reference"), iCat = col("category");
  if (iItem < 0 || iUnit < 0 || iEf < 0) {
    return { items: [], errors: ["หัวตารางต้องมีคอลัมน์ item, unit, ef (รูปแบบเดียวกับ EF_Scope3_V1.csv)"] };
  }
  const items: Scope3Factor[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = (r[iItem] || "").trim();
    const unit = (r[iUnit] || "").trim();
    const efText = (r[iEf] || "").trim();
    const factor = Number(efText);
    const id = `CFP-${(iNo >= 0 ? (r[iNo] || "").trim() : "") || idx + 1}`;
    if (!name) errors.push(`แถว ${line}: ไม่มีชื่อรายการ`);
    else if (!unit) errors.push(`แถว ${line}: ไม่มีหน่วย`);
    else if (efText === "" || !Number.isFinite(factor) || factor < 0) errors.push(`แถว ${line}: EF ไม่ถูกต้อง`);
    else if (seen.has(id)) errors.push(`แถว ${line}: รหัส ${id} ซ้ำ`);
    else {
      seen.add(id);
      const catRaw = iCat >= 0 ? (r[iCat] || "").trim() : "";
      const category = (SCOPE3_CATEGORY_ORDER as string[]).includes(catRaw)
        ? (catRaw as Scope3Category)
        : classifyCfpItem(name);
      const ref = iRef >= 0 ? (r[iRef] || "").trim() : "";
      items.push({ id, name, unit, factor, category, source: ref || `CFP table (${fileName})` });
    }
  });
  return { items, errors };
}

export default function Scope3List() {
  const factors = useScope3Factors();
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | Scope3Category>("all");
  const [editingId, setEditingId] = useState<string | null>(null); // "new" = adding a row
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details: string[] } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return factors.filter(
      (f) =>
        (catFilter === "all" || f.category === catFilter) &&
        (!q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.source.toLowerCase().includes(q))
    );
  }, [factors, query, catFilter]);

  const stopEditing = () => {
    setEditingId(null);
    setDraft(null);
    setError("");
  };

  const startEdit = (f: Scope3Factor) => {
    setEditingId(f.id);
    setDraft(toDraft(f));
    setError("");
  };

  const startAdd = () => {
    setEditingId("new");
    setDraft({ name: "", unit: "kg", factor: "", category: "purchased_goods", source: "CFP table (เพิ่มเอง)" });
    setError("");
  };

  const saveDraft = () => {
    if (!draft) return;
    const err = validateDraft(draft);
    if (err) {
      setError(err);
      return;
    }
    const values = {
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      factor: Number(draft.factor),
      category: draft.category,
      source: draft.source.trim() || "CFP table",
    };
    if (editingId === "new") {
      setScope3Factors([...factors, { id: nextId(factors), ...values }]);
    } else {
      setScope3Factors(factors.map((f) => (f.id === editingId ? { ...f, ...values } : f)));
    }
    stopEditing();
  };

  const removeRow = (f: Scope3Factor) => {
    if (window.confirm(`ลบรายการ ${f.id} - ${f.name} ?\nรายการกิจกรรมที่เคยใช้รหัสนี้จะไม่มีค่า EF`)) {
      setScope3Factors(factors.filter((x) => x.id !== f.id));
    }
  };

  const handleUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { items, errors } = parseTable(String(reader.result), file.name);
      if (items.length === 0) {
        setMsg({ ok: false, text: "นำเข้าไม่สำเร็จ", details: errors.slice(0, 10) });
        return;
      }
      if (!window.confirm(`จะแทนที่ตาราง CFP เดิม (${factors.length} รายการ) ด้วย ${items.length} รายการจากไฟล์นี้ ดำเนินการต่อหรือไม่?`)) return;
      setScope3Factors(items);
      stopEditing();
      setMsg({ ok: true, text: `นำเข้า ${items.length} รายการ, ข้าม ${errors.length} แถว`, details: errors.slice(0, 10) });
    };
    reader.readAsText(file);
  };

  const exportCsv = () => {
    const header = ["itemNo", "item", "unit", "ef", "reference", "category"].join(",");
    const rows = factors.map((f) =>
      [f.id.replace(/^CFP-/, ""), f.name, f.unit, f.factor, f.source, f.category].map(csvEscape).join(",")
    );
    downloadText("scope3_cfp_table.csv", [header, ...rows].join("\n") + "\n");
  };

  const resetTable = () => {
    if (window.confirm("คืนค่าตาราง CFP เป็นค่าเริ่มต้นจาก EF_Scope3_V1.csv ?\nการแก้ไขและการนำเข้าที่ทำไว้จะหายไป")) {
      resetScope3Factors();
      stopEditing();
      setMsg(null);
    }
  };

  const renderEditCells = () => (
    <>
      <td className="text-xs text-gray-500">{editingId === "new" ? "ใหม่" : editingId}</td>
      <td>
        <input className="input" value={draft!.name} onChange={(e) => setDraft({ ...draft!, name: e.target.value })} />
      </td>
      <td>
        <input className="input w-20" value={draft!.unit} onChange={(e) => setDraft({ ...draft!, unit: e.target.value })} />
      </td>
      <td>
        <input className="input w-28 text-right" type="number" step="any" value={draft!.factor} onChange={(e) => setDraft({ ...draft!, factor: e.target.value })} />
      </td>
      <td>
        <select className="input" value={draft!.category} onChange={(e) => setDraft({ ...draft!, category: e.target.value as Scope3Category })}>
          {SCOPE3_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{SCOPE3_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </td>
      <td>
        <input className="input" value={draft!.source} onChange={(e) => setDraft({ ...draft!, source: e.target.value })} />
      </td>
      <td>
        <div className="flex gap-1">
          <button onClick={saveDraft} className="p-1.5 text-emerald-600 hover:text-emerald-800" title="บันทึก"><Check className="w-4 h-4" /></button>
          <button onClick={stopEditing} className="p-1.5 text-gray-500 hover:text-gray-800" title="ยกเลิก"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </td>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ตาราง CFP</h1>
          <p className="text-sm text-gray-500">ค่า EF ที่ใช้คำนวณ Scope 3 ทุกหน้า ตั้งต้นจาก EF_Scope3_V1.csv แก้ไขหรืออัปโหลดใหม่ได้</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-4">
          <p className="text-sm text-gray-600">จำนวนรายการ EF</p>
          <p className="text-2xl font-bold">{formatNumber(factors.length)}</p>
          <p className="text-xs text-gray-500">แสดง {filtered.length} รายการตามตัวกรอง</p>
        </div>
        <div className="panel p-4 md:col-span-2 flex flex-wrap gap-2 items-center">
          <label className="btn-primary cursor-pointer">
            <Upload className="w-4 h-4" /> อัปโหลด CSV (แทนที่ตารางทั้งหมด)
            <input type="file" hidden accept=".csv,text/csv" onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button className="btn-secondary" onClick={exportCsv}><Download className="w-4 h-4" /> ดาวน์โหลด CSV</button>
          <button className="btn-secondary" onClick={startAdd} disabled={editingId !== null}><Plus className="w-4 h-4" /> เพิ่มรายการ</button>
          <button className="btn-secondary" onClick={resetTable}><RotateCcw className="w-4 h-4" /> คืนค่าเริ่มต้น</button>
          <p className="w-full text-xs text-gray-500">
            คอลัมน์ CSV: itemNo, item, unit, ef, reference, category (category ไม่บังคับ) รูปแบบเดียวกับ EF_Scope3_V1.csv
          </p>
        </div>
      </div>

      {msg && (
        <div className={`panel p-4 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          <div className="flex justify-between">
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
          </div>
          {msg.details.map((d, i) => <div key={i} className="text-xs text-gray-600 mt-1">{d}</div>)}
        </div>
      )}

      <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
        <select className="input max-w-sm" value={catFilter} onChange={(e) => setCatFilter(e.target.value as "all" | Scope3Category)}>
          <option value="all">ทุกหมวด Scope 3</option>
          {SCOPE3_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{SCOPE3_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <input className="input max-w-xs" placeholder="ค้นหาชื่อ / รหัส / แหล่งอ้างอิง" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>รายการ</th>
              <th>หน่วย</th>
              <th className="text-right">EF (kgCO2e/หน่วย)</th>
              <th>หมวด Scope 3</th>
              <th>แหล่งอ้างอิง</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {editingId === "new" && <tr className="bg-emerald-50">{renderEditCells()}</tr>}
            {filtered.length === 0 && editingId !== "new" && (
              <tr><td colSpan={7} className="text-center text-gray-400 py-6">ไม่พบรายการ</td></tr>
            )}
            {filtered.map((f) =>
              editingId === f.id ? (
                <tr key={f.id} className="bg-emerald-50">{renderEditCells()}</tr>
              ) : (
                <tr key={f.id}>
                  <td className="text-xs text-gray-500">{f.id}</td>
                  <td>{f.name}</td>
                  <td>{f.unit}</td>
                  <td className="text-right">{f.factor}</td>
                  <td className="text-xs">{SCOPE3_CATEGORY_LABELS[f.category]}</td>
                  <td className="text-xs text-gray-500 max-w-xs truncate" title={f.source}>{f.source}</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(f)} disabled={editingId !== null} className="p-1.5 text-gray-400 hover:text-emerald-600 disabled:opacity-30" title="แก้ไข"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => removeRow(f)} disabled={editingId !== null} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30" title="ลบ"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
