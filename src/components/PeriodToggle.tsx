import React from "react";
import { useApp } from "../context/AppContext";
import { yearOf } from "../types";

// เลือกปีที่จะกรอกข้อมูล (ปีปัจจุบัน ปีฐาน หรือปีย้อนหลังอื่น ๆ). ใช้ในทุกหน้า Scope.
export default function PeriodToggle() {
  const { state, year, setYear } = useApp();
  const [customYear, setCustomYear] = React.useState("");

  const reportingYear = Number(state.company.reportingYear) || new Date().getFullYear();
  const baseYear = state.company.basePeriodYear;

  // ปีที่มีข้อมูลอยู่แล้ว (ไม่รวมปีปัจจุบันและปีฐานที่แสดงเป็นปุ่มหลักอยู่แล้ว)
  const otherYears = React.useMemo(() => {
    const set = new Set<number>();
    state.activities.forEach((a) => set.add(yearOf(a, state.company)));
    return [...set]
      .filter((y) => y !== reportingYear && y !== baseYear)
      .sort((a, b) => b - a);
  }, [state.activities, state.company, reportingYear, baseYear]);

  const options: Array<{ value: number; label: string }> = [
    { value: reportingYear, label: `ปีปัจจุบัน (${reportingYear})` },
    ...(baseYear ? [{ value: baseYear, label: `ปีฐาน (${baseYear})` }] : []),
    ...otherYears.map((y) => ({ value: y, label: `ปี ${y}` })),
  ];
  // ปีที่กำลังเลือกอยู่ แต่ไม่อยู่ในรายการ (เช่น กรอกเอง) ให้แสดงเป็นปุ่มด้วย
  if (!options.some((o) => o.value === year)) {
    options.push({ value: year, label: `ปี ${year}` });
  }

  const applyCustomYear = () => {
    const y = Number(customYear);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) {
      alert("กรุณาระบุปี ค.ศ. ให้ถูกต้อง (1900-2200)");
      return;
    }
    setYear(y);
    setCustomYear("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-gray-600">ปีที่กรอกข้อมูล:</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setYear(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            year === o.value
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
      <span className="flex items-center gap-1 ml-2">
        <input
          type="number"
          min={1900}
          max={2200}
          value={customYear}
          onChange={(e) => setCustomYear(e.target.value)}
          placeholder="ปี ค.ศ."
          className="w-24 px-2 py-1.5 rounded-lg text-sm border border-gray-300"
        />
        <button
          type="button"
          onClick={applyCustomYear}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        >
          เลือกปีนี้
        </button>
      </span>
    </div>
  );
}
