import { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import {
  SCOPE1_ITEMS,
  SCOPE1_EF,
  efTotalPerUnit,
  DEFAULT_GWP,
  GWP_STORAGE_KEY,
  type GwpSet,
  type Scope1EF,
} from "../data/scope1Reference";
import { tenantStorage } from "../data/tenantStorage";

const EF_STORAGE_KEY = "scope1.efRows";

const GWP_FIELDS: { key: keyof GwpSet; label: string }[] = [
  { key: "co2", label: "CO2" },
  { key: "fossilCh4", label: "Fossil CH4" },
  { key: "ch4", label: "CH4" },
  { key: "n2o", label: "N2O" },
  { key: "sf6", label: "SF6" },
  { key: "nf3", label: "NF3" },
];

// Numeric EF columns shown in the table and editable in edit mode.
const NUM_FIELDS: { key: keyof Scope1EF; label: string }[] = [
  { key: "co2", label: "CO2" },
  { key: "ch4", label: "CH4" },
  { key: "n2o", label: "N2O" },
  { key: "hfc", label: "HFCs" },
  { key: "pfc", label: "PFCs" },
  { key: "sf6", label: "SF6" },
  { key: "hfcGwp", label: "HFC GWP" },
  { key: "pfcGwp", label: "PFC GWP" },
];

function loadGwp(): GwpSet {
  try {
    const raw = tenantStorage.getItem(GWP_STORAGE_KEY);
    if (raw) return { ...DEFAULT_GWP, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_GWP;
}

function loadEf(): Scope1EF[] {
  try {
    const raw = tenantStorage.getItem(EF_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Scope1EF[];
      if (Array.isArray(saved) && saved.length === SCOPE1_EF.length) return saved;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return SCOPE1_EF;
}

// mode "items": Scope 1 item list. mode "ef": editable emission-factor components plus GWP100 panel.
export default function Scope1Reference({ mode }: { mode: "items" | "ef" }) {
  const [gwp, setGwp] = useState<GwpSet>(loadGwp);
  const [efRows, setEfRows] = useState<Scope1EF[]>(loadEf);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scope1EF | null>(null);

  useEffect(() => {
    tenantStorage.setItem(GWP_STORAGE_KEY, JSON.stringify(gwp));
  }, [gwp]);

  useEffect(() => {
    tenantStorage.setItem(EF_STORAGE_KEY, JSON.stringify(efRows));
  }, [efRows]);

  if (mode === "items") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">รายการ Scope 1 ทั้งหมด (Reference)</h1>
          <p className="text-gray-500 mt-1">ดูค่า EF ของแต่ละรายการได้ที่เมนู "EF Components"</p>
        </div>
        <div className="panel p-5 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">No</th>
                <th>หมวด (Category)</th>
                <th>รายการ (ไทย)</th>
                <th>Item (English)</th>
                <th className="w-20">หน่วย</th>
                <th className="w-24">EF_ID</th>
              </tr>
            </thead>
            <tbody>
              {SCOPE1_ITEMS.map((it) => (
                <tr key={it.no}>
                  <td>{it.no}</td>
                  <td className="text-sm">{it.category}</td>
                  <td className="text-sm">{it.nameTh}</td>
                  <td className="text-sm">{it.nameEn}</td>
                  <td>{it.unit}</td>
                  <td className="font-mono text-xs">{it.efId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const startEdit = (row: Scope1EF) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };
  const saveEdit = () => {
    if (!draft) return;
    setEfRows((rows) => rows.map((r) => (r.id === draft.id ? draft : r)));
    cancelEdit();
  };
  const setNum = (key: keyof Scope1EF, value: string) => {
    const v = Number(value);
    setDraft((d) => (d ? { ...d, [key]: Number.isFinite(v) ? v : 0 } : d));
  };

  const inputCls = "w-20 rounded border border-gray-300 px-1 py-0.5 text-right text-xs";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">EF Components (Scope 1)</h1>
        <p className="text-gray-500 mt-1">
          Total/หน่วย (kgCO2e) = CO2×GWP + CH4×GWP + N2O×GWP + HFC/PFC×GWP + SF6×GWP (แก้ไขค่า GWP ได้ที่แผงด้านขวา, แก้ไข EF ได้ด้วยไอคอนดินสอ)
        </p>
      </div>
      <div className="flex gap-4 items-start">
        <div className="panel p-5 overflow-x-auto flex-1 min-w-0">
          <table className="table text-sm">
            <thead>
              <tr>
                <th className="w-10"></th>
                <th>EF_ID</th>
                <th>ชื่อ</th>
                <th>หน่วย</th>
                <th className="text-right">CO2</th>
                <th className="text-right">CH4</th>
                <th className="text-right">N2O</th>
                <th className="text-right">HFCs</th>
                <th className="text-right">PFCs</th>
                <th className="text-right">SF6</th>
                <th className="text-right">HFC GWP</th>
                <th className="text-right">PFC GWP</th>
                <th className="text-right">Total (kgCO2e/หน่วย)</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {efRows.map((e) => {
                const editing = editingId === e.id && draft;
                const r = editing ? draft : e;
                return (
                  <tr key={e.id} className={editing ? "bg-amber-50" : ""}>
                    <td>
                      {editing ? (
                        <div className="flex gap-1">
                          <button onClick={saveEdit} title="บันทึก" className="text-emerald-600 hover:text-emerald-800">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} title="ยกเลิก" className="text-gray-500 hover:text-gray-800">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(e)} title="แก้ไข" className="text-gray-500 hover:text-emerald-700">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                    <td className="font-mono text-xs">{e.id}</td>
                    <td>
                      {editing ? (
                        <input
                          value={r.name}
                          onChange={(ev) => setDraft((d) => (d ? { ...d, name: ev.target.value } : d))}
                          className="w-48 rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      ) : (
                        e.name
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          value={r.unit}
                          onChange={(ev) => setDraft((d) => (d ? { ...d, unit: ev.target.value } : d))}
                          className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      ) : (
                        e.unit
                      )}
                    </td>
                    {NUM_FIELDS.map((f) => (
                      <td key={f.key} className="text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="any"
                            value={r[f.key] as number}
                            onChange={(ev) => setNum(f.key, ev.target.value)}
                            className={inputCls}
                          />
                        ) : (
                          (e[f.key] as number)
                        )}
                      </td>
                    ))}
                    <td className="text-right font-semibold">{efTotalPerUnit(r, gwp).toFixed(4)}</td>
                    <td className="text-xs text-gray-500">
                      {editing ? (
                        <input
                          value={r.source}
                          onChange={(ev) => setDraft((d) => (d ? { ...d, source: ev.target.value } : d))}
                          className="w-48 rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                      ) : (
                        e.source
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="panel p-4 w-64 shrink-0">
          <h2 className="font-bold text-gray-900">GWP100</h2>
          <p className="text-xs text-gray-500 mb-3">ที่มา: IPCC, AR5 (แก้ไขได้)</p>
          <div className="space-y-2">
            {GWP_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700">{f.label}</span>
                <input
                  type="number"
                  step="any"
                  value={gwp[f.key]}
                  onChange={(ev) => {
                    const v = Number(ev.target.value);
                    setGwp((g) => ({ ...g, [f.key]: Number.isFinite(v) ? v : 0 }));
                  }}
                  className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                />
              </label>
            ))}
          </div>
          <button
            onClick={() => setGwp(DEFAULT_GWP)}
            className="mt-4 w-full rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            คืนค่า IPCC AR5
          </button>
          <button
            onClick={() => setEfRows(SCOPE1_EF)}
            className="mt-2 w-full rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            คืนค่า EF เริ่มต้น
          </button>
          <p className="mt-3 text-xs text-gray-500">
            Fossil CH4 และ NF3 บันทึกไว้เพื่ออ้างอิง ยังไม่มีคอลัมน์ EF ที่ใช้คำนวณ
          </p>
        </aside>
      </div>
    </div>
  );
}
