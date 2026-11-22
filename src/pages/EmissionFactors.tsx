import { useEffect, useMemo, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Upload, Search } from "lucide-react";
import { SCOPE1_STATIONARY, SCOPE1_MOBILE, SCOPE1_FUGITIVE, SCOPE2_ELECTRICITY } from "../data/emissionFactors";
import type { EmissionFactor } from "../data/emissionFactors";
import { tenantStorage } from "../data/tenantStorage";

export default function EmissionFactors() {
  const [factors, setFactors] = useState<EmissionFactor[]>([...SCOPE1_STATIONARY, ...SCOPE1_MOBILE, ...SCOPE1_FUGITIVE, ...SCOPE2_ELECTRICITY]);
  const [scope, setScope] = useState<"all" | "scope1" | "scope2">("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    try { const saved = tenantStorage.getItem("cfo_saas_emission_factors"); if (saved) setFactors(JSON.parse(saved)); } catch { /* ignore invalid saved data */ }
  }, []);
  const saveFactors = (next: EmissionFactor[]) => { setFactors(next); tenantStorage.setItem("cfo_saas_emission_factors", JSON.stringify(next)); };
  const filtered = useMemo(() => factors.filter(f => (scope === "all" || (scope === "scope2" ? f.category === "electricity" : f.category !== "electricity")) && f.name.toLowerCase().includes(query.toLowerCase())), [factors, scope, query]);
  const upload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result).split(/\r?\n/).filter(Boolean).slice(1).map((line) => line.split(",").map(v => v.trim().replace(/^"|"$/g, ""))).filter(r => r.length >= 3 && !isNaN(Number(r[1])));
      const imported = rows.map((r, i): EmissionFactor => ({ id: `uploaded-${Date.now()}-${i}`, name: r[0], factor: Number(r[1]), unit: r[2] || "unit", category: r[3] === "electricity" ? "electricity" : "stationary", source: file.name }));
      if (imported.length) saveFactors([...factors, ...imported]);
    };
    reader.readAsText(file);
  };
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold text-gray-900">Emission Factor (EF)</h1><p className="text-sm text-gray-500">ตารางปัจจัยการปล่อยก๊าซเรือนกระจกจาก TGO</p></div>
    <div className="panel p-4 flex flex-wrap gap-3 items-center justify-between">
      <div className="flex gap-2"><button onClick={() => setScope("all")} className={`btn-secondary ${scope === "all" ? "bg-emerald-50" : ""}`}>ทั้งหมด</button><button onClick={() => setScope("scope1")} className={`btn-secondary ${scope === "scope1" ? "bg-emerald-50" : ""}`}>Scope 1</button><button onClick={() => setScope("scope2")} className={`btn-secondary ${scope === "scope2" ? "bg-emerald-50" : ""}`}>Scope 2</button></div>
      <div className="flex gap-2"><div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400"/><input className="input pl-9" placeholder="ค้นหา EF" value={query} onChange={e => setQuery(e.target.value)}/></div><label className="btn-primary cursor-pointer"><Upload className="w-4 h-4"/> อัปโหลด EF จาก TGO<input type="file" hidden accept=".csv" onChange={e => upload(e.target.files?.[0])}/></label></div>
    </div>
    <div className="panel overflow-x-auto"><table className="table"><thead><tr><th>ขอบเขต</th><th>รายการ</th><th>ปัจจัยการปล่อย</th><th>หน่วย</th><th>แหล่งอ้างอิง</th><th>แก้ไข</th></tr></thead><tbody>{filtered.map(f => <tr key={f.id}><td>{f.category === "electricity" ? "Scope 2" : "Scope 1"}</td><td>{f.name}</td><td className="text-right">{editingId === f.id ? <input className="input w-32 text-right" type="number" step="any" value={draft} onChange={e => setDraft(e.target.value)} /> : f.factor}</td><td>{f.unit}</td><td>{f.source || "TGO"}</td><td>{editingId === f.id ? <span className="flex gap-1"><button className="p-1 text-emerald-600" title="บันทึก" onClick={() => { const value = Number(draft); if (value > 0 && Number.isFinite(value)) saveFactors(factors.map(x => x.id === f.id ? { ...x, factor: value } : x)); setEditingId(null); }}><Check className="w-4 h-4" /></button><button className="p-1 text-gray-500" title="ยกเลิก" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></button></span> : <button className="p-1 text-gray-500 hover:text-emerald-600" title="แก้ไขค่า EF" onClick={() => { setEditingId(f.id); setDraft(String(f.factor)); }}><Pencil className="w-4 h-4" /></button>}</td></tr>)}</tbody></table></div>
  </div>;
}
