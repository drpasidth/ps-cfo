import React from "react";
import { useApp } from "../context/AppContext";
import { calculateTotals, formatNumber } from "../utils/calculations";
import { periodOf } from "../types";
import { Download, Save, FileText, Database, RefreshCw, ClipboardCheck, Lock } from "lucide-react";
import { downloadVerificationSheet as downloadFilledVerificationSheet } from "../utils/verificationSheet";
import { downloadWordReport } from "../utils/wordReport";
import { downloadSignificanceCsv, downloadUncertaintyCsv } from "../utils/assessmentExport";
import { useUncertaintyScores } from "../data/uncertainty";
import { useAuth } from "../context/AuthContext";
import { filterActivitiesByPackage } from "../utils/packages";

export default function Export() {
  const { state: rawState, year } = useApp();
  const { session, hasFeature } = useAuth();
  // Verification sheet and backups only contain the scopes included in the tenant's package.
  const state = { ...rawState, activities: filterActivitiesByPackage(rawState.activities, session?.tenant.package) };
  const includeScope3 = hasFeature("scope3");
  const canWord = hasFeature("report_word");
  const scores = useUncertaintyScores();
  const currentActivities = state.activities.filter((a) => periodOf(a) === "current");
  const result = calculateTotals(currentActivities);

  const downloadJSON = () => {
    const data = {
      company: state.company,
      activities: state.activities,
      uncertaintyScores: scores,
      exportedAt: new Date().toISOString(),
      calculatedTotals: result,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo_backup_${state.company.companyName || "company"}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadVerificationSheet = async () => {
    try {
      await downloadFilledVerificationSheet(state);
    } catch {
      alert("ไม่พบไฟล์ต้นแบบ Verification Sheet");
    }
  };

 const downloadCSV = () => {
    const headers = [
      "วันที่",
      "ขอบเขต",
      "หมวด",
      "ปัจจัยการปล่อย",
      "ปริมาณกิจกรรม",
      "หน่วย",
      "ปัจจัยการปล่อย (EF)",
      "CO2e (kg)",
      "หมายเหตุ",
    ];
    const rows = currentActivities.map((a) => [
      new Date(a.date).toLocaleDateString("th-TH"),
      a.scope === "scope1" ? "Scope 1" : a.scope === "scope2" ? "Scope 2" : "Scope 3",
      a.subCategory,
      a.factorId,
      a.activityData,
      a.unit,
      a.co2e / a.activityData || 0,
      a.co2e,
      a.note || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cfo_activities_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.company) {
          // Note: import would need dispatch; here we just show preview
          alert("ไฟล์ถูกอ่านแล้ว (ฟีเจอร์นำเข้าจะพร้อมในเวอร์ชันถัดไป)");
        }
      } catch {
        alert("อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ JSON ที่ถูกต้อง");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Download className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">สร้าง Verification Sheet / สำรองและนำเข้าข้อมูล</h1>
      </div>
      <p className="text-gray-600">
        ข้อมูลของคุณถูกจัดเก็บในฐานข้อมูลของบริษัทบนเซิร์ฟเวอร์ โปรดสำรองข้อมูลเป็นประจำ
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">สำรองข้อมูล (Export)</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            ดาวน์โหลดข้อมูลทั้งหมดรวมถึงข้อมูลบริษัท รายการกิจกรรม และผลการคำนวณ
          </p>
          <div className="space-y-2">
            <button onClick={downloadVerificationSheet} className="btn-primary w-full justify-start"><ClipboardCheck className="w-4 h-4 mr-2" /> สร้าง Verification Sheet</button>
            {canWord ? (
              <button
                onClick={() => downloadWordReport({ company: state.company, activities: state.activities, includeScope3, factors: state.factors }).catch(() => alert("สร้างรายงาน Word ไม่สำเร็จ"))}
                className="btn-primary w-full justify-start"
              >
                <FileText className="w-4 h-4 mr-2" /> สร้างรายงานก๊าซเรือนกระจก (Word .docx)
              </button>
            ) : (
              <button disabled title="ต้องใช้แพ็กเกจที่มีรายงาน Word" className="btn-secondary w-full justify-start opacity-60 cursor-not-allowed">
                <Lock className="w-4 h-4 mr-2" /> สร้างรายงานก๊าซเรือนกระจก (Word) — ไม่รวมในแพ็กเกจนี้
              </button>
            )}
             <button onClick={downloadJSON} className="btn-secondary w-full justify-start">
              <FileText className="w-4 h-4 mr-2" /> ดาวน์โหลดเป็น JSON
            </button>
            <button onClick={downloadCSV} className="btn-secondary w-full justify-start">
              <Save className="w-4 h-4 mr-2" /> ดาวน์โหลดรายการเป็น CSV
            </button>
            {includeScope3 && (
              <>
                <button
                  onClick={() => downloadSignificanceCsv(state.company, state.activities)}
                  className="btn-secondary w-full justify-start"
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" /> ดาวน์โหลดตารางประเมินนัยสำคัญ Scope 3 (CSV)
                </button>
                <button
                  onClick={() => downloadUncertaintyCsv(state.activities, state.company, state.factors, year, scores)}
                  className="btn-secondary w-full justify-start"
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" /> ดาวน์โหลดตารางประเมินความไม่แน่นอน ปี {year} (CSV)
                </button>
              </>
            )}
          </div>
          <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-xs text-gray-500">
              รวม {currentActivities.length} รายการกิจกรรม (ปีปัจจุบัน) &bull; CO2e รวม{" "}
              <span className="font-medium">{formatNumber(result.grandTotalRaw)} kg</span>
            </p>
          </div>
        </div>

        <div className="panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-gray-900">นำเข้าข้อมูล (Import)</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            เลือกไฟล์ JSON ที่สำรองไว้เพื่อกู้คืนข้อมูลเข้าสู่ระบบ
          </p>
          <div>
            <input
              type="file"
              accept=".json"
              onChange={importJSON}
              className="input w-full"
            />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            หมายเหตุ: ฟีเจอร์นำเข้าเป็นเวอร์ชันเริ่มต้น โปรดตรวจสอบข้อมูลหลังนำเข้า
          </p>
        </div>
      </div>

      <div className="panel p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ข้อมูลปัจจุบันในระบบ</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-500 uppercase">ข้อมูลบริษัท</p>
            <p className="text-sm font-medium text-gray-900">
              {state.company.companyName || "-"}
            </p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-500 uppercase">รายการกิจกรรม</p>
            <p className="text-sm font-medium text-gray-900">
              {state.activities.length}
            </p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-500 uppercase">ปีที่รายงาน</p>
            <p className="text-sm font-medium text-gray-900">
              {state.company.reportingYear || "-"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => {
              if (
                window.confirm(
                  "ต้องการล้างข้อมูลทั้งหมดในระบบหรือไม่? การกระทำนี้ย้อนกลับไม่ได้"
                )
              ) {
                // We don't have a reset action exposed easily; reload page clears memory but not localStorage.
                // For simplicity, alert user.
                alert(
                  "ใช้ปุ่มล้างในแต่ละหน้า หรือล้างข้อมูลเบราว์เซอร์เพื่อเริ่มต้นใหม่"
                );
              }
            }}
            className="btn-danger"
          >
            ล้างข้อมูลทั้งหมด
          </button>
        </div>
      </div>
    </div>
  );
}
