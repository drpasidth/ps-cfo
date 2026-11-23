import { useMemo } from "react";
import { Download } from "lucide-react";
import { formatNumber } from "../utils/calculations";
import { downloadText, csvEscape } from "../utils/csv";
import { periodOf, type ActivityRecord, type CompanyProfile, type Scope, type SubCategory } from "../types";

// ส่วนรายละเอียดเพิ่มเติมของรายงานออนไลน์: KPI, แนวโน้มรายเดือน, หมวดย่อย, เทียบปีฐาน, คุณภาพข้อมูล
// ค่าทั้งหมดในไฟล์นี้เป็น kgCO2e ยกเว้นที่ระบุว่า tCO2e

type ScopeKey = Scope;

const SCOPE_META: Record<ScopeKey, { label: string; color: string; badge: string }> = {
  scope1: { label: "Scope 1", color: "#f97316", badge: "badge-scope1" },
  scope2: { label: "Scope 2", color: "#2563eb", badge: "badge-scope2" },
  scope3: { label: "Scope 3", color: "#7c3aed", badge: "badge-scope3" },
};

const SUB_LABELS: Partial<Record<SubCategory, string>> = {
  stationary: "การเผาไหม้เชื้อเพลิงนิ่ง",
  mobile: "การเผาไหม้เชื้อเพลิงเคลื่อนที่",
  fugitive: "การปล่อยทางรอยรั่ว",
  electricity: "ไฟฟ้าที่ซื้อมา",
  purchased_goods: "สินค้าและบริการที่ซื้อ",
  capital_goods: "สินทรัพย์ทุน",
  fuel_energy: "เชื้อเพลิงและพลังงาน (ไม่รวม Scope 1–2)",
  upstream_transport: "การขนส่งต้นน้ำ",
  waste: "ของเสียจากการดำเนินงาน",
  business_travel: "การเดินทางเพื่อธุรกิจ",
  commuting: "การเดินทางของพนักงาน",
  upstream_leased: "สินทรัพย์เช่าต้นน้ำ",
  downstream_transport: "การขนส่งปลายน้ำ",
  processing_sold: "การแปรรูปผลิตภัณฑ์ที่ขาย",
  use_sold: "การใช้งานผลิตภัณฑ์ที่ขาย",
  end_of_life: "การจัดการหลังหมดอายุ",
  downstream_leased: "สินทรัพย์เช่าปลายน้ำ",
  franchises: "แฟรนไชส์",
  investments: "การลงทุน",
  water: "น้ำ",
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function monthOf(a: ActivityRecord): number {
  const m = /^(\d{4})-(\d{1,2})/.exec(a.month ?? "");
  if (m) return Number(m[2]);
  const d = new Date(a.date);
  return isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
}

const sumKg = (list: ActivityRecord[]) => list.reduce((s, a) => s + (a.co2e || 0), 0);
const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const changePct = (cur: number, base: number) => (base > 0 ? ((cur - base) / base) * 100 : null);

interface Props {
  activities: ActivityRecord[]; // รายการทั้งหมดที่ผ่านการกรองตามแพ็กเกจแล้ว
  company: CompanyProfile;
  includeScope3: boolean;
}

export default function ReportInsights({ activities, company, includeScope3 }: Props) {
  const current = useMemo(() => activities.filter((a) => periodOf(a) === "current"), [activities]);
  const base = useMemo(() => activities.filter((a) => periodOf(a) === "base"), [activities]);
  const scopes: ScopeKey[] = includeScope3 ? ["scope1", "scope2", "scope3"] : ["scope1", "scope2"];

  const totalKg = sumKg(current);
  const currentByScope: Record<ScopeKey, number> = {
    scope1: sumKg(current.filter((a) => a.scope === "scope1")),
    scope2: sumKg(current.filter((a) => a.scope === "scope2")),
    scope3: sumKg(current.filter((a) => a.scope === "scope3")),
  };

  // ปีฐาน: ใช้รายการที่กรอกเป็นปีฐาน ถ้าไม่มีให้ใช้ประวัติปีฐานที่กรอกในหน้าบริษัท (tCO2e)
  const baseHistory = company.baseYearEmissions;
  const useHistory = base.length === 0 && !!baseHistory;
  const baseByScope: Record<ScopeKey, number> = useHistory
    ? {
        scope1: (baseHistory?.scope1 ?? 0) * 1000,
        scope2: (baseHistory?.scope2 ?? 0) * 1000,
        scope3: (baseHistory?.scope3 ?? 0) * 1000,
      }
    : {
        scope1: sumKg(base.filter((a) => a.scope === "scope1")),
        scope2: sumKg(base.filter((a) => a.scope === "scope2")),
        scope3: sumKg(base.filter((a) => a.scope === "scope3")),
      };
  const baseTotal = scopes.reduce((s, k) => s + baseByScope[k], 0);
  const totalChange = changePct(totalKg, baseTotal);

  // แนวโน้มรายเดือน (แยก Scope, หน่วย tCO2e)
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, scope1: 0, scope2: 0, scope3: 0 }));
  current.forEach((a) => {
    const m = monthOf(a);
    if (m >= 1 && m <= 12) monthly[m - 1][a.scope] += (a.co2e || 0) / 1000;
  });
  const monthMax = Math.max(0.001, ...monthly.map((m) => m.scope1 + m.scope2 + (includeScope3 ? m.scope3 : 0)));

  // หมวดย่อย
  const subRows = useMemo(() => {
    const map = new Map<string, { scope: Scope; label: string; count: number; kg: number }>();
    current.forEach((a) => {
      const key = `${a.scope}:${a.subCategory}`;
      const row = map.get(key) ?? { scope: a.scope, label: SUB_LABELS[a.subCategory] ?? a.subCategory, count: 0, kg: 0 };
      row.count += 1;
      row.kg += a.co2e || 0;
      map.set(key, row);
    });
    return [...map.values()].filter((r) => includeScope3 || r.scope !== "scope3").sort((a, b) => b.kg - a.kg);
  }, [current, includeScope3]);

  const topSources = useMemo(() => [...current].sort((a, b) => (b.co2e || 0) - (a.co2e || 0)).slice(0, 5), [current]);

  const checks = [
    { label: "รายการที่ไม่มีคำอธิบายกิจกรรม", n: current.filter((a) => !a.description?.trim()).length },
    { label: "รายการที่ไม่มีเอกสารแนบเป็นหลักฐาน", n: current.filter((a) => !a.attachments?.length).length },
    { label: "รายการที่ค่า CO₂e เป็นศูนย์หรือติดลบ", n: current.filter((a) => !(a.co2e > 0)).length },
    { label: "รายการที่ไม่ระบุเดือน", n: current.filter((a) => !a.month).length },
    {
      label: "ข้อมูลผู้จัดทำ / ผู้ตรวจทาน / ผู้อนุมัติที่ยังว่าง",
      n: [company.preparedBy, company.reviewedBy, company.approvedBy].filter((v) => !v?.trim()).length,
    },
  ];

  const exportCsv = () => {
    const header = ["ปี", "ประเภทปี", "Scope", "หมวดย่อย", "รายการ EF", "เดือน", "วันที่", "ปริมาณ", "หน่วย", "CO2e (kg)", "รายละเอียด", "หมายเหตุ", "จำนวนเอกสารแนบ"];
    const rows = activities.map((a) => [
      a.year ?? company.reportingYear,
      periodOf(a),
      a.scope,
      SUB_LABELS[a.subCategory] ?? a.subCategory,
      a.factorId,
      a.month ?? "",
      a.date,
      a.activityData,
      a.unit,
      a.co2e,
      a.description ?? "",
      a.note ?? "",
      a.attachments?.length ?? 0,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => csvEscape(v)).join(",")).join("\n");
    downloadText(`CFO_Activities_${company.reportingYear || "report"}.csv`, csv);
  };

  // SVG แท่งแนวโน้มรายเดือนแบบซ้อน
  const W = 720;
  const H = 220;
  const L = 50;
  const B = 28;
  const T = 10;
  const plotH = H - T - B;
  const slot = (W - L - 10) / 12;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-bold text-gray-900">รายละเอียดเพิ่มเติม</h3>
        <button onClick={exportCsv} className="print-hide btn-secondary">
          <Download className="w-4 h-4 mr-2" /> ส่งออกรายการเป็น CSV
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel p-4">
          <p className="text-xs text-gray-500">รวมการปล่อย (ปีที่รายงาน)</p>
          <p className="text-xl font-bold text-gray-900">{formatNumber(totalKg / 1000, 2)} tCO₂e</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-gray-500">เทียบปีฐาน</p>
          <p className={`text-xl font-bold ${totalChange === null ? "text-gray-400" : totalChange > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {totalChange === null ? "ไม่มีข้อมูลปีฐาน" : `${totalChange > 0 ? "▲" : "▼"} ${formatNumber(Math.abs(totalChange), 1)}%`}
          </p>
          {baseTotal > 0 && <p className="text-xs text-gray-400">ปีฐาน {formatNumber(baseTotal / 1000, 2)} tCO₂e{useHistory ? " (จากประวัติปีฐาน)" : ""}</p>}
        </div>
        <div className="panel p-4">
          <p className="text-xs text-gray-500">จำนวนรายการ (ปีที่รายงาน)</p>
          <p className="text-xl font-bold text-gray-900">{current.length}</p>
          <p className="text-xs text-gray-400">รายการปีฐาน {base.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-gray-500">แหล่งที่ปล่อยสูงสุด</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{subRows[0]?.label ?? "-"}</p>
          {subRows[0] && <p className="text-xs text-gray-400">{formatNumber(subRows[0].kg / 1000, 2)} tCO₂e</p>}
        </div>
      </div>

      {/* สัดส่วนแต่ละ Scope */}
      <div className="panel p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-800">สัดส่วนการปล่อยแยกตาม Scope</p>
        <div className="flex h-5 w-full overflow-hidden rounded bg-gray-100">
          {scopes.map((s) => (
            <div key={s} style={{ width: `${pctOf(currentByScope[s], totalKg)}%`, background: SCOPE_META[s].color }} title={SCOPE_META[s].label} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          {scopes.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: SCOPE_META[s].color }} />
              {SCOPE_META[s].label}: {formatNumber(currentByScope[s] / 1000, 2)} tCO₂e ({formatNumber(pctOf(currentByScope[s], totalKg), 1)}%)
            </span>
          ))}
        </div>
      </div>

      {/* แนวโน้มรายเดือน */}
      <div className="panel p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">การปล่อยรายเดือน (tCO₂e)</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          <line x1={L} y1={H - B} x2={W - 10} y2={H - B} stroke="#9ca3af" />
          <line x1={L} y1={T} x2={L} y2={H - B} stroke="#9ca3af" />
          <text x={L - 6} y={T + 4} textAnchor="end" fontSize={10} fill="#4b5563">{formatNumber(monthMax, 2)}</text>
          <text x={L - 6} y={H - B + 4} textAnchor="end" fontSize={10} fill="#4b5563">0</text>
          {monthly.map((m, i) => {
            let yCursor = H - B;
            const x = L + i * slot + slot * 0.15;
            const w = slot * 0.7;
            const segs = scopes.map((s) => ({ s, v: m[s] }));
            return (
              <g key={m.month}>
                {segs.map(({ s, v }) => {
                  const h = (v / monthMax) * plotH;
                  yCursor -= h;
                  return (
                    <rect key={s} x={x} y={yCursor} width={w} height={h} fill={SCOPE_META[s].color}>
                      <title>{`${MONTHS[i]} ${SCOPE_META[s].label}: ${formatNumber(v, 3)} tCO₂e`}</title>
                    </rect>
                  );
                })}
                <text x={x + w / 2} y={H - B + 14} textAnchor="middle" fontSize={10} fill="#4b5563">{MONTHS[i]}</text>
              </g>
            );
          })}
        </svg>
        {monthly.every((m) => m.scope1 + m.scope2 + m.scope3 === 0) && (
          <p className="text-xs text-gray-400 mt-1">ยังไม่มีรายการที่ระบุเดือน</p>
        )}
      </div>

      {/* ตารางหมวดย่อย */}
      <div className="panel p-4 overflow-x-auto">
        <p className="text-sm font-semibold text-gray-800 mb-2">การปล่อยแยกตามหมวดย่อย</p>
        {subRows.length === 0 ? (
          <p className="text-sm text-gray-500">ยังไม่มีรายการในปีที่รายงาน</p>
        ) : (
          <table className="table text-sm">
            <thead>
              <tr>
                <th>Scope</th>
                <th>หมวดย่อย</th>
                <th className="text-right">จำนวนรายการ</th>
                <th className="text-right">tCO₂e</th>
                <th className="text-right">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {subRows.map((r) => (
                <tr key={`${r.scope}-${r.label}`}>
                  <td><span className={`badge ${SCOPE_META[r.scope].badge}`}>{SCOPE_META[r.scope].label}</span></td>
                  <td>{r.label}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right">{formatNumber(r.kg / 1000, 3)}</td>
                  <td className="text-right">{formatNumber(pctOf(r.kg, totalKg), 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 5 รายการที่ปล่อยมากที่สุด */}
      <div className="panel p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">5 รายการที่ปล่อยมากที่สุด</p>
        {topSources.length === 0 ? (
          <p className="text-sm text-gray-500">ยังไม่มีรายการ</p>
        ) : (
          <ol className="list-decimal pl-6 space-y-1 text-sm text-gray-700">
            {topSources.map((a) => (
              <li key={a.id}>
                {a.factorId} ({SUB_LABELS[a.subCategory] ?? a.subCategory}) — {formatNumber(a.co2e / 1000, 3)} tCO₂e
                {a.month ? ` · ${a.month}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* เทียบปีฐาน */}
      <div className="panel p-4 overflow-x-auto">
        <p className="text-sm font-semibold text-gray-800 mb-2">เทียบกับปีฐาน (tCO₂e)</p>
        <table className="table text-sm">
          <thead>
            <tr>
              <th>ขอบเขต</th>
              <th className="text-right">ปีฐาน</th>
              <th className="text-right">ปีที่รายงาน</th>
              <th className="text-right">การเปลี่ยนแปลง</th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => {
              const c = changePct(currentByScope[s], baseByScope[s]);
              return (
                <tr key={s}>
                  <td>{SCOPE_META[s].label}</td>
                  <td className="text-right">{formatNumber(baseByScope[s] / 1000, 3)}</td>
                  <td className="text-right">{formatNumber(currentByScope[s] / 1000, 3)}</td>
                  <td className="text-right">{c === null ? "-" : `${c > 0 ? "+" : ""}${formatNumber(c, 1)}%`}</td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-gray-50">
              <td>รวม</td>
              <td className="text-right">{formatNumber(baseTotal / 1000, 3)}</td>
              <td className="text-right">{formatNumber(totalKg / 1000, 3)}</td>
              <td className="text-right">{totalChange === null ? "-" : `${totalChange > 0 ? "+" : ""}${formatNumber(totalChange, 1)}%`}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ตรวจคุณภาพข้อมูล */}
      <div className="panel p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">ตรวจความครบถ้วนของข้อมูลก่อนส่งทวนสอบ</p>
        <ul className="space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex justify-between gap-4">
              <span className="text-gray-700">{c.label}</span>
              <span className={c.n === 0 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                {c.n === 0 ? "✓ ผ่าน" : `⚠ ${c.n} รายการ`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
