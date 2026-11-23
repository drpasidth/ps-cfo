// ฉบับพิมพ์ของแผน Net Zero Pathway (A4) ใช้ "บันทึกเป็น PDF" ของเบราว์เซอร์
// ซ่อนบนหน้าจอด้วยคลาส print-show และแสดงเฉพาะตอนพิมพ์ (ดู .print-area ใน index.css)
import PathwayChart from "./PathwayChart";
import { formatNumber } from "../utils/calculations";
import {
  INITIATIVE_SCOPE_LABEL,
  INITIATIVE_STATUS_LABEL,
  SCOPE_KEYS,
  SCOPE_LABEL,
  type Baselines,
  type NetZeroPlan,
  type PathwayYear,
  type PlanAlert,
} from "../data/netZeroPathway";
import type { CompanyProfile } from "../types";

interface Props {
  company: CompanyProfile;
  plan: NetZeroPlan;
  baselines: Baselines;
  rows: PathwayYear[];
  alerts: PlanAlert[];
  reportingYear: number;
  printedAt: string;
}

const n1 = (v: number) => formatNumber(v, 1);

export default function NetZeroPrintReport({ company, plan, baselines, rows, alerts, reportingYear, printedAt }: Props) {
  const baselineTotal = SCOPE_KEYS.reduce((t, s) => t + baselines[s], 0);
  const interimRow = rows.find((r) => r.year === plan.interimYear) ?? null;
  const netZeroRow = rows.find((r) => r.year === plan.netZeroYear) ?? null;
  const totalInterim = interimRow?.target ?? baselineTotal;
  const totalNetZero = netZeroRow?.target ?? baselineTotal;
  const companyName = company.companyName || "-";

  return (
    <div className="print-show print-area bg-white text-gray-900 p-6 text-[12pt] leading-relaxed">
      {/* หัวเอกสาร */}
      <div className="border-b-2 border-emerald-700 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-emerald-800">แผนการลดก๊าซเรือนกระจกสู่ Net Zero (Net Zero Pathway)</h1>
        <p className="text-base font-semibold mt-1">
          {companyName}
          {company.companyNameThai ? ` (${company.companyNameThai})` : ""}
        </p>
        <p className="text-sm text-gray-600">
          ปีที่รายงาน {reportingYear} · ปีฐาน {plan.baseYear} · ปีเป้าหมายระยะกลาง {plan.interimYear} · ปี Net Zero {plan.netZeroYear}
          <span className="float-right">พิมพ์เมื่อ {printedAt}</span>
        </p>
      </div>

      {/* 1. สรุป */}
      <h2 className="text-lg font-bold text-emerald-800 mt-4 mb-2">1. สรุปเป้าหมาย</h2>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Kpi label={`การปล่อยปีฐาน (${plan.baseYear})`} value={`${n1(baselineTotal)} tCO2e`} />
        <Kpi label={`เป้าหมายระยะกลาง (${plan.interimYear})`} value={`${n1(totalInterim)} tCO2e`} />
        <Kpi label={`เป้าหมาย Net Zero (${plan.netZeroYear})`} value={`${n1(totalNetZero)} tCO2e`} />
        <Kpi
          label="การลด Net Zero จากปีฐาน"
          value={`${formatNumber(baselineTotal ? (1 - totalNetZero / baselineTotal) * 100 : 0, 1)}%`}
        />
      </div>

      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="bg-emerald-700 text-white">
            <th className="border px-2 py-1 text-left">Scope</th>
            <th className="border px-2 py-1 text-right">ปีฐาน (tCO2e)</th>
            <th className="border px-2 py-1 text-right">% ลดระยะกลาง</th>
            <th className="border px-2 py-1 text-right">เป้า {plan.interimYear} (tCO2e)</th>
            <th className="border px-2 py-1 text-right">% ลด Net Zero</th>
            <th className="border px-2 py-1 text-right">เป้า {plan.netZeroYear} (tCO2e)</th>
          </tr>
        </thead>
        <tbody>
          {SCOPE_KEYS.map((s) => {
            const t = plan.scopeTargets[s];
            const target = (p: number) => baselines[s] * (1 - p / 100);
            return (
              <tr key={s}>
                <td className="border px-2 py-1">{SCOPE_LABEL[s]}</td>
                <td className="border px-2 py-1 text-right">{n1(baselines[s])}</td>
                <td className="border px-2 py-1 text-right">{t.interimPct}%</td>
                <td className="border px-2 py-1 text-right">{n1(target(t.interimPct))}</td>
                <td className="border px-2 py-1 text-right">{t.netZeroPct}%</td>
                <td className="border px-2 py-1 text-right">{n1(target(t.netZeroPct))}</td>
              </tr>
            );
          })}
          <tr className="font-semibold bg-gray-50">
            <td className="border px-2 py-1">รวม</td>
            <td className="border px-2 py-1 text-right">{n1(baselineTotal)}</td>
            <td className="border px-2 py-1 text-right">
              {formatNumber(baselineTotal ? (1 - totalInterim / baselineTotal) * 100 : 0, 1)}%
            </td>
            <td className="border px-2 py-1 text-right">{n1(totalInterim)}</td>
            <td className="border px-2 py-1 text-right">
              {formatNumber(baselineTotal ? (1 - totalNetZero / baselineTotal) * 100 : 0, 1)}%
            </td>
            <td className="border px-2 py-1 text-right">{n1(totalNetZero)}</td>
          </tr>
        </tbody>
      </table>

      {/* 2. กราฟ */}
      <div className="break-before-page">
        <h2 className="text-lg font-bold text-emerald-800 mt-4 mb-2">2. เส้นทางการลดก๊าซเรือนกระจก</h2>
        <p className="text-xs text-gray-600 mb-2">
          เส้นทึบ = เป้าหมาย · เส้นประ = คาดว่าจะเหลือหลังใช้แผนโครงการ · จุดน้ำเงิน = ค่าจริง (tCO2e)
        </p>
        <div className="mb-3">
          <h3 className="text-sm font-semibold mb-1">รวมทุก Scope</h3>
          <PathwayChart
            color="#059669"
            kind={plan.chartKinds.total}
            interimYear={plan.interimYear}
            rows={rows.map((r) => ({ year: r.year, target: r.target, actual: r.actual, withPlan: r.target + r.gap }))}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SCOPE_KEYS.map((s) => (
            <div key={s}>
              <h3 className="text-xs font-semibold mb-1">{SCOPE_LABEL[s]}</h3>
              <PathwayChart
                color="#059669"
                kind={plan.chartKinds[s]}
                interimYear={plan.interimYear}
                rows={rows.map((r) => ({
                  year: r.year,
                  target: r.byScope[s].target,
                  actual: r.byScope[s].actual,
                  withPlan: r.byScope[s].target + r.byScope[s].gap,
                }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 3. ตารางรายปี */}
      <h2 className="text-lg font-bold text-emerald-800 mt-6 mb-2 break-before-page">3. เป้าหมายและผลการดำเนินงานรายปี</h2>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-emerald-700 text-white">
            <th className="border px-1 py-1 text-left">ปี</th>
            <th className="border px-1 py-1 text-right">เป้ารวม</th>
            <th className="border px-1 py-1 text-right">ค่าจริงรวม</th>
            <th className="border px-1 py-1 text-right">ต้องลดจากปีฐาน</th>
            <th className="border px-1 py-1 text-right">ลดได้ตามแผน</th>
            <th className="border px-1 py-1 text-right">ช่องว่าง</th>
            <th className="border px-1 py-1 text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year} className="break-inside-avoid">
              <td className="border px-1 py-0.5">{r.year}</td>
              <td className="border px-1 py-0.5 text-right">{n1(r.target)}</td>
              <td className="border px-1 py-0.5 text-right">{r.actual === null ? "-" : n1(r.actual)}</td>
              <td className="border px-1 py-0.5 text-right">{n1(r.required)}</td>
              <td className="border px-1 py-0.5 text-right">{n1(r.planned)}</td>
              <td className={`border px-1 py-0.5 text-right ${r.gap > 0 ? "text-red-600" : ""}`}>{n1(r.gap)}</td>
              <td className="border px-1 py-0.5 text-center">
                {r.year === plan.baseYear ? "ปีฐาน" : r.actual === null ? "ยังไม่มีข้อมูล" : r.gap > 0 ? "ยังขาดการลด" : "ครอบคลุม"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 4. โครงการ */}
      <h2 className="text-lg font-bold text-emerald-800 mt-6 mb-2 break-before-page">4. แผนโครงการ/มาตรการลดก๊าซ</h2>
      {plan.initiatives.length === 0 ? (
        <p className="text-sm text-gray-500">ยังไม่มีโครงการ</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-emerald-700 text-white">
              <th className="border px-1 py-1 text-left">โครงการ/มาตรการ</th>
              <th className="border px-1 py-1 text-left">Scope</th>
              <th className="border px-1 py-1 text-right">เริ่มให้ผล</th>
              <th className="border px-1 py-1 text-right">ลดได้ (tCO2e/ปี)</th>
              <th className="border px-1 py-1 text-left">สถานะ</th>
              <th className="border px-1 py-1 text-right">ความคืบหน้า</th>
              <th className="border px-1 py-1 text-left">กำหนดเสร็จ</th>
              <th className="border px-1 py-1 text-left">KPI</th>
              <th className="border px-1 py-1 text-left">ผู้รับผิดชอบ</th>
            </tr>
          </thead>
          <tbody>
            {plan.initiatives.map((i) => (
              <tr key={i.id} className="break-inside-avoid">
                <td className="border px-1 py-0.5">{i.name || "(ยังไม่ตั้งชื่อ)"}</td>
                <td className="border px-1 py-0.5">{INITIATIVE_SCOPE_LABEL[i.scope]}</td>
                <td className="border px-1 py-0.5 text-right">{i.startYear}</td>
                <td className="border px-1 py-0.5 text-right">{n1(i.reductionTco2e)}</td>
                <td className="border px-1 py-0.5">{INITIATIVE_STATUS_LABEL[i.status]}</td>
                <td className="border px-1 py-0.5 text-right">{i.progress}%</td>
                <td className="border px-1 py-0.5">{i.dueDate || "-"}</td>
                <td className="border px-1 py-0.5">{i.kpi || "-"}</td>
                <td className="border px-1 py-0.5">{i.owner || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 5. การแจ้งเตือน */}
      <h2 className="text-lg font-bold text-emerald-800 mt-6 mb-2">5. การแจ้งเตือนและการติดตาม</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่มีรายการที่ต้องติดตาม</p>
      ) : (
        <ul className="list-disc pl-6 text-sm space-y-1">
          {alerts.map((a, idx) => (
            <li key={idx}>{a.text}</li>
          ))}
        </ul>
      )}

      {/* 6. ลงนาม */}
      <h2 className="text-lg font-bold text-emerald-800 mt-6 mb-2">6. การจัดทำและอนุมัติ</h2>
      <div className="grid grid-cols-3 gap-4 text-sm mt-8">
        {[
          ["จัดทำโดย", company.preparedBy],
          ["ตรวจทานโดย", company.reviewedBy],
          ["อนุมัติโดย", company.approvedBy],
        ].map(([label, name]) => (
          <div key={label} className="text-center">
            <div className="border-b border-gray-500 h-10" />
            <p className="mt-1">{label}</p>
            <p className="text-gray-600">{name || "................................"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-300 rounded p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-bold">{value}</p>
    </div>
  );
}
