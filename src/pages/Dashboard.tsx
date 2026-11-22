import { useApp } from "../context/AppContext";
import { useState } from "react";
import {
  calculateTotals,
  formatNumber,
  formatInt,
  activitiesByFactor,
  baseYearTotalsT,
} from "../utils/calculations";
import { periodOf } from "../types";
import { Factory, Zap, TrendingUp, Activity, ClipboardCheck, Truck } from "lucide-react";
import { downloadVerificationSheet } from "../utils/verificationSheet";
import { Link } from "react-router-dom";

const statItems = [
  {
    title: "กิจกรรมทั้งหมด",
    key: "activities",
    icon: Activity,
    color: "text-gray-600",
    bg: "bg-gray-50",
  },
  {
    title: "การปล่อยก๊าซ Scope 1",
    key: "scope1",
    icon: Factory,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  {
    title: "การปล่อยก๊าซ Scope 2",
    key: "scope2",
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    title: "การปล่อยก๊าซ Scope 3",
    key: "scope3",
    icon: Truck,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    title: "รวมก๊าซเรือนกระจก",
    key: "total",
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

// Bar chart of tCO2e per scope (x: Scope 1-3, y: tonnes). Plain SVG, no chart library.
function ScopeBarChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 640, H = 260, L = 60, R = 20, T = 20, B = 40;
  const innerW = W - L - R, innerH = H - T - B;
  const max = Math.max(...points.map((p) => p.value), 0);
  const niceMax = max > 0 ? Math.ceil(max * 1.1 * 100) / 100 : 1;
  const yAt = (v: number) => T + innerH - (v / niceMax) * innerH;
  const slot = innerW / points.length;
  const barW = Math.min(80, slot * 0.5);
  const xAt = (i: number) => L + slot * i + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="กราฟเส้น tCO2e ตาม Scope">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={yAt(t)} y2={yAt(t)} stroke="#e5e7eb" />
          <text x={L - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280">
            {formatNumber(t, 2)}
          </text>
        </g>
      ))}
      <text x={12} y={T - 4} fontSize="12" fontWeight="600" fill="#374151">tCO2e</text>
      {points.map((p, i) => (
        <g key={p.label}>
          <rect x={xAt(i) - barW / 2} y={yAt(p.value)} width={barW} height={T + innerH - yAt(p.value)} fill="#059669" rx="3" />
          <text x={xAt(i)} y={yAt(p.value) - 10} textAnchor="middle" fontSize="11" fill="#065f46">
            {formatNumber(p.value, 2)}
          </text>
          <text x={xAt(i)} y={H - B + 18} textAnchor="middle" fontSize="12" fill="#374151">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// Grouped bar chart: for each scope, a current-year bar and a base-year bar side by side.
function ScopeCompareChart({ groups }: { groups: { label: string; current: number; base: number }[] }) {
  const W = 640, H = 260, L = 60, R = 20, T = 20, B = 40;
  const innerW = W - L - R, innerH = H - T - B;
  const max = Math.max(...groups.flatMap((g) => [g.current, g.base]), 0);
  const niceMax = max > 0 ? Math.ceil(max * 1.1 * 100) / 100 : 1;
  const yAt = (v: number) => T + innerH - (v / niceMax) * innerH;
  const slot = innerW / groups.length;
  const barW = Math.min(50, slot * 0.3);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const series = [
    { key: "current" as const, label: "ปีปัจจุบัน", color: "#059669", text: "#065f46" },
    { key: "base" as const, label: "ปีฐาน", color: "#9ca3af", text: "#374151" },
  ];

  return (
    <div>
      <div className="flex gap-4 text-xs text-gray-600 mb-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="กราฟเปรียบเทียบ tCO2e ต่อ Scope">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={yAt(t)} y2={yAt(t)} stroke="#e5e7eb" />
            <text x={L - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280">
              {formatNumber(t, 2)}
            </text>
          </g>
        ))}
        <text x={12} y={T - 4} fontSize="12" fontWeight="600" fill="#374151">tCO2e</text>
        {groups.map((g, i) => {
          const cx = L + slot * i + slot / 2;
          return (
            <g key={g.label}>
              {series.map((s, j) => {
                const value = g[s.key];
                const x = cx + (j === 0 ? -barW - 2 : 2);
                return (
                  <g key={s.key}>
                    <rect x={x} y={yAt(value)} width={barW} height={T + innerH - yAt(value)} fill={s.color} rx="3" />
                    <text x={x + barW / 2} y={yAt(value) - 6} textAnchor="middle" fontSize="10" fill={s.text}>
                      {formatNumber(value, 2)}
                    </text>
                  </g>
                );
              })}
              <text x={cx} y={H - B + 18} textAnchor="middle" fontSize="12" fill="#374151">{g.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Dashboard() {
  const { state } = useApp();
  const [previewError, setPreviewError] = useState("");
  // Dashboard shows the current year; base-year activities are used only for the comparison.
  const currentActivities = state.activities.filter((a) => periodOf(a) === "current");
  const baseActivities = state.activities.filter((a) => periodOf(a) === "base");
  const result = calculateTotals(currentActivities);
  const enriched = activitiesByFactor(currentActivities, state.factors);

  const totalActivities = currentActivities.length;
  const scope3Raw = currentActivities
    .filter((a) => (a.scope as string) === "scope3")
    .reduce((sum, a) => sum + a.co2e, 0);
  const scopeChartData = [
    { label: "Scope 1", value: result.scope1.rawTotal / 1000 },
    { label: "Scope 2", value: result.scope2.rawTotal / 1000 },
    { label: "Scope 3", value: scope3Raw / 1000 },
  ];
  // Base year: always derived from the activities entered for the base period.
  const baseYearT = baseYearTotalsT(baseActivities);
  const comparisonChartData = [
    { label: "Scope 1", current: scopeChartData[0].value, base: baseYearT.scope1 },
    { label: "Scope 2", current: scopeChartData[1].value, base: baseYearT.scope2 },
    { label: "Scope 3", current: scopeChartData[2].value, base: baseYearT.scope3 },
  ];

  const openVerificationPreview = async () => {
    try {
      setPreviewError("");
      await downloadVerificationSheet(state);
    } catch {
      setPreviewError("ไม่พบไฟล์ต้นแบบ Verification Sheet");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ภาพรวมการปล่อยก๊าซเรือนกระจก</h1>
          <p className="text-gray-500 mt-1">
            คาร์บอนฟุตพริ้นท์ขององค์กร (CFO) ปี {state.company.reportingYear}
          </p>
        </div>
        <button onClick={openVerificationPreview} className="btn-primary"><ClipboardCheck className="w-4 h-4 mr-2" /> สร้าง Verification Sheet</button>
         <Link to="/scope1" className="btn-secondary">
          <Factory className="w-4 h-4 mr-2" /> เพิ่มกิจกรรม Scope 1
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statItems.map((item, i) => {
          let value: string | number = totalActivities;
          let sub = "";
          if (item.key === "scope1")
            value = formatNumber(result.scope1.rawTotal);
          else if (item.key === "scope2")
            value = formatNumber(result.scope2.rawTotal);
          else if (item.key === "scope3")
            value = formatNumber(scope3Raw);
          else if (item.key === "total") {
            value = formatInt(result.grandTotalRounded);
            sub = "กิโลกรัม CO2e (ปัดขึ้นเป็นจำนวนเต็ม)";
          }
          return (
            <div
              key={i}
              className={`panel p-5 ${item.bg}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{item.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                  {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color} ${item.bg.replace("bg-", "bg-")}10`}>
                  <item.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">การปล่อยก๊าซตาม Scope (ตัน CO2e)</h2>
          <ScopeBarChart points={scopeChartData} />
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">เปรียบเทียบปีปัจจุบันกับปีฐาน (ตัน CO2e)</h2>
          <ScopeCompareChart groups={comparisonChartData} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">รายการกิจกรรมล่าสุด</h2>
            <Link to="/report" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              ดูรายงานทั้งหมด →
            </Link>
          </div>
          {enriched.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>ยังไม่มีข้อมูลกิจกรรม</p>
              <p className="text-xs mt-1">เริ่มต้นโดยเพิ่มข้อมูลใน Scope 1 หรือ Scope 2</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="w-20">วันที่</th>
                  <th>กิจกรรม / ปัจจัยการปล่อย</th>
                  <th className="text-right w-32">ข้อมูลกิจกรรม</th>
                  <th className="text-right w-32">CO2e (kg)</th>
                  <th className="w-20">ขอบเขต</th>
                </tr>
              </thead>
              <tbody>
                {enriched
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 8)
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="text-xs text-gray-500">
                        {new Date(a.date).toLocaleDateString("th-TH")}
                      </td>
                      <td className="text-sm text-gray-800">
                        {a.factorName}
                      </td>
                      <td className="text-sm text-right text-gray-800">
                        {formatNumber(a.activityData)} {a.factorUnit}
                      </td>
                      <td className="text-sm font-medium text-right text-gray-800">
                        {formatNumber(a.co2e)}
                      </td>
                      <td>
                        <span className={`badge ${
                          a.scope === "scope1" ? "badge-scope1" : a.scope === "scope2" ? "badge-scope2" : "badge-scope3"
                        }`}>
                          {a.scope === "scope1" ? "Scope 1" : a.scope === "scope2" ? "Scope 2" : "Scope 3"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">สรุปตามขอบเขต</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-scope1">ขอบเขตที่ 1 (Scope 1)</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(result.scope1.rawTotal)}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                การเผาไหม้เชื้อเพลิงนิ่ง, เคลื่อนที่, และการปล่อยทางรอยรั่ว
              </div>
              <div className="mt-2 text-right text-xs text-gray-400">
                {result.scope1.recordCount} รายการ
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-scope2">ขอบเขตที่ 2 (Scope 2)</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(result.scope2.rawTotal)}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                ไฟฟ้าที่ซื้อมาจากภายนอก (grid mix)
              </div>
              <div className="mt-2 text-right text-xs text-gray-400">
                {result.scope2.recordCount} รายการ
              </div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-scope3">ขอบเขตที่ 3 (Scope 3)</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(result.scope3.rawTotal)}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                กิจกรรมห่วงโซ่อุปทานอื่น ๆ (ตามหลักเกณฑ์ TGO)
              </div>
              <div className="mt-2 text-right text-xs text-gray-400">
                {result.scope3.recordCount} รายการ
              </div>
            </div>
            <div className="p-4 rounded-lg border-2 border-emerald-200 bg-emerald-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-emerald-800">
                  รวมทั้งหมด (ปัดขึ้น)
                </span>
                <span className="text-lg font-bold text-emerald-800">
                  {formatInt(result.grandTotalRounded)}
                </span>
              </div>
              <div className="text-xs text-emerald-600 mt-1">
                เท่ากับ {formatNumber(result.co2Tonnes, 2)} ตัน CO2e
              </div>
            </div>
          </div>
        </div>
      </div>
      {previewError && <div className="text-red-600">{previewError}</div>}
    </div>
  );
}
