import { useState } from "react";
import { formatNumber } from "../utils/calculations";
import type { ChartKind } from "../data/netZeroPathway";

// ข้อมูลหนึ่งปีสำหรับกราฟ (tCO2e)
export interface ChartRow {
  year: number;
  target: number; // เป้าหมาย
  actual: number | null; // ค่าจริงจากกิจกรรม (null = ยังไม่มีข้อมูลปีนั้น)
  withPlan: number; // คาดว่าจะเหลือหลังใช้แผนโครงการ = เป้า + ช่องว่าง
}

const COLOR_PLAN = "#f97316";
const COLOR_ACTUAL = "#2563eb";

const W = 800;
const H = 300;
const L = 70;
const R = 20;
const T = 28;
const B = 40;

interface Props {
  rows: ChartRow[]; // ปีแรกของ rows คือปีฐาน
  interimYear: number;
  color: string; // สีของเส้น/แท่งเป้าหมาย
  kind?: ChartKind; // รูปแบบที่ควบคุมจากภายนอก (เช่น ค่าที่บันทึกไว้ในแผน)
  onKindChange?: (kind: ChartKind) => void;
}

export default function PathwayChart({ rows, interimYear, color, kind: kindProp, onKindChange }: Props) {
  const [localKind, setLocalKind] = useState<ChartKind>("line");
  const kind = kindProp ?? localKind;
  const setKind = onKindChange ?? setLocalKind;
  if (rows.length === 0) return null;

  const baseYear = rows[0].year;
  const lastYear = rows[rows.length - 1].year;
  const maxValue =
    Math.max(
      1,
      ...rows.map((r) => r.target),
      ...rows.map((r) => r.withPlan),
      ...rows.flatMap((r) => (r.actual === null ? [] : [r.actual])),
    ) * 1.1;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const yOf = (value: number) => H - B - (value / maxValue) * plotH;
  const slot = plotW / rows.length;
  const xCenter = (idx: number) => L + idx * slot + slot / 2;

  // ปีที่แสดงบนแกน X: ปีฐาน ปีระยะกลาง ปี Net Zero และทุกๆ n ปี (ไม่ให้แน่นเกินไป)
  const step = Math.max(1, Math.ceil((lastYear - baseYear) / 10));
  const tickIdx = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => (r.year - baseYear) % step === 0 || r.year === interimYear || r.year === lastYear)
    .map(({ idx }) => idx);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />เป้าหมาย</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLOR_PLAN }} />หลังใช้แผนโครงการ</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLOR_ACTUAL }} />ค่าจริง</span>
        </div>
        <div className="print-hide inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          {(["line", "bar"] as ChartKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1 ${kind === k ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {k === "line" ? "เส้น" : "แท่ง"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* แกนและเส้นกริดแนวนอน */}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#9ca3af" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#9ca3af" />
        <text x={L - 8} y={T + 4} textAnchor="end" fontSize={11} fill="#4b5563">{formatNumber(maxValue / 1.1, 0)}</text>
        <text x={L - 8} y={H - B + 4} textAnchor="end" fontSize={11} fill="#4b5563">0</text>

        {/* เส้นแนวตั้งและป้ายที่ปีฐาน ปีระยะกลาง และปี Net Zero */}
        {tickIdx.map((idx) => {
          const r = rows[idx];
          const isBase = r.year === baseYear;
          const isInterim = r.year === interimYear;
          return (
            <g key={r.year}>
              <line
                x1={xCenter(idx)} y1={T} x2={xCenter(idx)} y2={H - B}
                stroke={isBase ? "#0f766e" : "#e5e7eb"}
                strokeDasharray={isBase ? undefined : "4 4"}
                strokeWidth={isBase ? 1.5 : 1}
              />
              <text x={xCenter(idx)} y={H - B + 16} textAnchor="middle" fontSize={11}
                fontWeight={isBase ? 700 : 400} fill={isBase ? "#0f766e" : "#4b5563"}>
                {r.year}
              </text>
              {isBase && (
                <text x={xCenter(idx)} y={H - B + 30} textAnchor="middle" fontSize={10} fill="#0f766e">ปีฐาน</text>
              )}
              {isInterim && !isBase && (
                <text x={xCenter(idx)} y={T - 8} textAnchor="middle" fontSize={10} fill="#6b7280">ระยะกลาง</text>
              )}
            </g>
          );
        })}

        {kind === "line" ? (
          <>
            <polyline
              points={rows.map((r, idx) => `${xCenter(idx)},${yOf(r.withPlan)}`).join(" ")}
              fill="none" stroke={COLOR_PLAN} strokeWidth={2} strokeDasharray="6 4"
            />
            <polyline
              points={rows.map((r, idx) => `${xCenter(idx)},${yOf(r.target)}`).join(" ")}
              fill="none" stroke={color} strokeWidth={2.5}
            />
            {rows.map((r, idx) =>
              r.actual === null ? null : (
                <circle key={r.year} cx={xCenter(idx)} cy={yOf(r.actual)} r={r.year === baseYear ? 6 : 4} fill={COLOR_ACTUAL}>
                  <title>{`ปี ${r.year}: ค่าจริง ${formatNumber(r.actual, 1)} tCO2e`}</title>
                </circle>
              ),
            )}
          </>
        ) : (
          rows.map((r, idx) => {
            // แท่งกลุ่มละ 3 แท่ง: เป้าหมาย, หลังใช้แผนโครงการ, ค่าจริง
            const groupW = slot * 0.8;
            const barW = groupW / 3;
            const x0 = L + idx * slot + slot * 0.1;
            const bars = [
              { value: r.target, fill: color, label: "เป้าหมาย" },
              { value: r.withPlan, fill: COLOR_PLAN, label: "หลังใช้แผนโครงการ" },
              ...(r.actual === null ? [] : [{ value: r.actual, fill: COLOR_ACTUAL, label: "ค่าจริง" }]),
            ];
            return (
              <g key={r.year}>
                {bars.map((b, k) => (
                  <rect
                    key={k}
                    x={x0 + k * barW}
                    y={yOf(b.value)}
                    width={Math.max(1, barW - 1)}
                    height={Math.max(0, H - B - yOf(b.value))}
                    fill={b.fill}
                  >
                    <title>{`ปี ${r.year} ${b.label}: ${formatNumber(b.value, 1)} tCO2e`}</title>
                  </rect>
                ))}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
