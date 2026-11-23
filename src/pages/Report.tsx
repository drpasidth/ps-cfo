import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { calculateTotals, formatNumber, formatInt, kgToTonnes } from "../utils/calculations";
import { periodOf } from "../types";
import {
  FileText,
  Printer,
  Download,
  Factory,
  Fuel,
  Lock,
  Zap,
} from "lucide-react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { filterActivitiesByPackage } from "../utils/packages";
import { downloadWordReport } from "../utils/wordReport";
import ReportInsights from "../components/ReportInsights";

export default function Report() {
  const { state: rawState } = useApp();
  const { session, hasFeature } = useAuth();
  // Only the scopes included in the tenant's package appear in the report.
  const state = { ...rawState, activities: filterActivitiesByPackage(rawState.activities, session?.tenant.package) };
  const includeScope3 = hasFeature("scope3");
  const canWord = hasFeature("report_word");
  const currentActivities = state.activities.filter((a) => periodOf(a) === "current");
  const result = calculateTotals(currentActivities);
  const scope1Activities = currentActivities.filter((a) => a.scope === "scope1");
  const scope2Activities = currentActivities.filter((a) => a.scope === "scope2");

  const stationary = scope1Activities.filter((a) => a.subCategory === "stationary");
  const mobile = scope1Activities.filter((a) => a.subCategory === "mobile");
  const fugitive = scope1Activities.filter((a) => a.subCategory === "fugitive");

  const s1Stationary = stationary.reduce((s, a) => s + a.co2e, 0);
  const s1Mobile = mobile.reduce((s, a) => s + a.co2e, 0);
  const s1Fugitive = fugitive.reduce((s, a) => s + a.co2e, 0);
  const s2Electricity = scope2Activities.reduce((s, a) => s + a.co2e, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(16);
    doc.setTextColor(22, 101, 52);
    doc.text("ใบยืนยันข้อมูลการปล่อยก๊าซเรือนกระจกขององค์กร", 20, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Carbon Footprint for Organization (CFO) - Verification Sheet", 20, 28);
    doc.text("ตามแนวทาง TGO และ ISO 14064-1", 20, 34);

    let y = 44;
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("ข้อมูลบริษัท", 20, y);
    y += 6;
    doc.setFontSize(9);
    const companyLines = [
      `ชื่อบริษัท: ${state.company.companyName || "-"} ${state.company.companyNameThai ? "(" + state.company.companyNameThai + ")" : ""}`,
      `ที่อยู่: ${state.company.address || "-"}`,
      `เลขผู้เสียภาษี: ${state.company.taxId || "-"}`,
      `อุตสาหกรรม: ${state.company.industry || "-"}`,
      `ปีที่รายงาน: ${state.company.reportingYear || "-"}`,
      `ระยะเวลา: ${state.company.reportingPeriodFrom || "-"} ถึง ${state.company.reportingPeriodTo || "-"}`,
      `ผู้จัดทำ: ${state.company.preparedBy || "-"} | ผู้ตรวจทาน: ${state.company.reviewedBy || "-"} | ผู้อนุมัติ: ${state.company.approvedBy || "-"}`,
    ];
    companyLines.forEach((line) => {
      doc.text(line, 20, y);
      y += 5;
    });

    y += 4;
    doc.setFontSize(11);
    doc.text("สรุปการปล่อยก๊าซเรือนกระจก (FR-05: ปัดขึ้นเป็นจำนวนเต็ม)", 20, y);
    y += 6;

    const tableData = [
      ["ขอบเขต", "หมวดย่อย", "CO2e (kg)", "CO2e (ปัดขึ้น)"],
      ["Scope 1", "การเผาไหม้เชื้อเพลิงนิ่ง", formatNumber(s1Stationary), formatInt(s1Stationary)],
      ["Scope 1", "การเผาไหม้เชื้อเพลิงเคลื่อนที่", formatNumber(s1Mobile), formatInt(s1Mobile)],
      ["Scope 1", "การปล่อยทางรอยรั่ว", formatNumber(s1Fugitive), formatInt(s1Fugitive)],
      ["Scope 1 รวม", "", formatNumber(result.scope1.rawTotal), formatInt(result.scope1.rawTotal)],
      ["Scope 2", "ไฟฟ้าที่ซื้อมา (grid mix)", formatNumber(s2Electricity), formatInt(s2Electricity)],
      ...(includeScope3
        ? [["Scope 3", "กิจกรรมห่วงโซ่อุปทานอื่น ๆ", formatNumber(result.scope3.rawTotal), formatInt(result.scope3.rawTotal)]]
        : []),
      ["รวม Scope 1 + Scope 2 + Scope 3", "", formatNumber(result.grandTotalRaw), formatInt(result.grandTotalRounded)],
    ];

    (doc as any).autoTable({
      startY: y,
      head: [tableData[0]],
      body: tableData.slice(1),
      theme: "grid",
      headStyles: { fillColor: [22, 101, 52], textColor: [255, 255, 255] },
      alternateRowColors: false,
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`รวมก๊าซเรือนกระจกทั้งหมด: ${formatInt(result.grandTotalRounded)} kgCO2e (เท่ากับ ${formatNumber(kgToTonnes(result.grandTotalRounded), 2)} ตัน CO2e)`, 20, y);

    const fileName = `CFO_Verification_${state.company.companyName || "company"}_${state.company.reportingYear}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              ใบยืนยันข้อมูล (Verification Sheet)
            </h1>
          </div>
          <p className="text-gray-600">
            รายงานคาร์บอนฟุตพริ้นท์ขององค์กรตามแบบฟอร์มการทวนสอบ TGO
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadPDF} className="btn-secondary">
            <Download className="w-4 h-4 mr-2" /> ดาวน์โหลด PDF
          </button>
          {canWord ? (
            <button
              onClick={() => downloadWordReport({ company: state.company, activities: state.activities, includeScope3, factors: state.factors })}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 mr-2" /> ดาวน์โหลด Word (.docx)
            </button>
          ) : (
            <button disabled title="ต้องใช้แพ็กเกจที่มีรายงาน Word" className="btn-secondary opacity-60 cursor-not-allowed">
              <Lock className="w-4 h-4 mr-2" /> Word (.docx) — ไม่รวมในแพ็กเกจนี้
            </button>
          )}
          <button onClick={handlePrint} className="btn-primary">
            <Printer className="w-4 h-4 mr-2" /> พิมพ์รายงาน
          </button>
        </div>
      </div>

      {/* Printable verification sheet */}
      <div className="print-show max-w-[210mm] mx-auto bg-white p-8 border border-gray-200 shadow-lg">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wider">
            ใบยืนยันข้อมูลการปล่อยก๊าซเรือนกระจกขององค์กร
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Carbon Footprint for Organization (CFO) - Verification Sheet
          </p>
          <p className="text-xs text-gray-400 mt-1">
            ตามแนวทาง TGO และ ISO 14064-1 | ปีที่รายงาน{" "}
            <span className="font-medium">{state.company.reportingYear}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase">ชื่อบริษัท</p>
            <p className="text-gray-800">
              {state.company.companyName || "-"}
              {state.company.companyNameThai ? (
                <span className="text-sm text-gray-500 ml-1">({state.company.companyNameThai})</span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase">ที่อยู่</p>
            <p className="text-gray-800">{state.company.address || "-"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">เลขผู้เสียภาษี / อุตสาหกรรม</p>
            <p className="text-gray-800">
              Tax ID: {state.company.taxId || "-"} &nbsp;|&nbsp;
              อุตสาหกรรม: {state.company.industry || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase">ระยะเวลาที่รายงาน</p>
            <p className="text-gray-800">
              {state.company.reportingPeriodFrom || "-"} ถึง{" "}
              {state.company.reportingPeriodTo || "-"}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">ผู้รับผิดชอบ</p>
            <p className="text-gray-800">
              จัดทำ: {state.company.preparedBy || "-"} &nbsp;|&nbsp;
              ตรวจทาน: {state.company.reviewedBy || "-"} &nbsp;|&nbsp;
              อนุมัติ: {state.company.approvedBy || "-"}
            </p>
          </div>
        </div>

        <div className="panel p-5 mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Factory className="w-4 h-4 text-orange-600" />
            สรุปการปล่อยก๊าซเรือนกระจก (Scope 1, Scope 2 และ Scope 3)
          </h3>
          <table className="table text-sm">
            <thead>
              <tr>
                <th className="w-1/4">ขอบเขต</th>
                <th className="w-1/3">หมวดกิจกรรม</th>
                <th className="text-right w-1/6">CO2e (kg) ทศนิยม 2 ตำแหน่ง</th>
                <th className="text-right w-1/6">CO2e (kg) ปัดขึ้นเต็มจำนวน</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="badge badge-scope1">Scope 1</td>
                <td>การเผาไหม้เชื้อเพลิงนิ่ง (หม้อไอน้ำ, เครื่องกำเนิดไฟฟ้า ฯลฯ)</td>
                <td className="text-right">{formatNumber(s1Stationary)}</td>
                <td className="text-right font-medium">{formatInt(s1Stationary)}</td>
              </tr>
              <tr>
                <td className="badge badge-scope1">Scope 1</td>
                <td>การเผาไหม้เชื้อเพลิงเคลื่อนที่ (ยานพาหนะขององค์กร)</td>
                <td className="text-right">{formatNumber(s1Mobile)}</td>
                <td className="text-right font-medium">{formatInt(s1Mobile)}</td>
              </tr>
              <tr>
                <td className="badge badge-scope1">Scope 1</td>
                <td>การปล่อยทางรอยรั่ว (สารทำความเย็น ฯลฯ)</td>
                <td className="text-right">{formatNumber(s1Fugitive)}</td>
                <td className="text-right font-medium">{formatInt(s1Fugitive)}</td>
              </tr>
              <tr className="bg-gray-50 font-semibold">
                <td className="badge badge-scope1">Scope 1 รวม</td>
                <td></td>
                <td className="text-right">{formatNumber(result.scope1.rawTotal)}</td>
                <td className="text-right">{formatInt(result.scope1.rawTotal)}</td>
              </tr>
              <tr>
                <td className="badge badge-scope2">Scope 2</td>
                <td>ไฟฟ้าที่ซื้อมาจากภายนอก (grid mix)</td>
                <td className="text-right">{formatNumber(s2Electricity)}</td>
                <td className="text-right font-medium">{formatInt(s2Electricity)}</td>
              </tr>
              {includeScope3 && (
                <tr>
                  <td className="badge badge-scope3">Scope 3</td>
                  <td>กิจกรรมห่วงโซ่อุปทานอื่น ๆ (ตามหลักเกณฑ์ TGO)</td>
                  <td className="text-right">{formatNumber(result.scope3.rawTotal)}</td>
                  <td className="text-right font-medium">{formatInt(result.scope3.rawTotal)}</td>
                </tr>
              )}
              <tr className="bg-emerald-50 font-bold text-emerald-800 border-t-2 border-emerald-200">
                <td>รวม Scope 1 + Scope 2 + Scope 3</td>
                <td></td>
                <td className="text-right">{formatNumber(result.grandTotalRaw)}</td>
                <td className="text-right">{formatInt(result.grandTotalRounded)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-500">
            หมายเหตุ: ตตามมติที่ประชุม TGO (ครั้งที่ 4/2563) Sheet FR-04 แสดงทศนิยม 2 ตำแหน่ง;
            Sheet FR-05 แสดงเป็นจำนวนเต็มโดยใช้สูตร Roundup; ผลรวม Scope 1+2 คำนวณหลังจากปัดขึ้นแต่ละ scope แล้ว
          </p>
        </div>

        <div className="mb-6">
          <ReportInsights activities={state.activities} company={state.company} includeScope3={includeScope3} />
        </div>

        <div className="panel p-5 mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">รายละเอียดรายการกิจกรรมและเอกสารแนบ</h3>
          {state.activities.length === 0 ? (
            <p className="text-sm text-gray-500">ยังไม่มีรายการกิจกรรม</p>
          ) : (
            <div className="space-y-3">
              {state.activities.map((activity) => {
                const factorName = activity.factorId;
                return (
                  <div key={activity.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`badge ${activity.scope === "scope1" ? "badge-scope1" : "badge-scope2"}`}>{activity.scope === "scope1" ? "Scope 1" : "Scope 2"}</span>
                      <span className="font-medium text-gray-800">{factorName}</span>
                      <span className="text-gray-500">เดือน {activity.month || new Date(activity.date).toISOString().slice(0, 7)}</span>
                      <span className="text-gray-600">{formatNumber(activity.activityData)} {activity.unit} = {formatNumber(activity.co2e)} kgCO2e</span>
                    </div>
                    {activity.description && <p className="mt-2 text-gray-700 whitespace-pre-wrap">รายละเอียด: {activity.description}</p>}
                    {activity.note && <p className="mt-1 text-gray-500">หมายเหตุ: {activity.note}</p>}
                    {(activity.attachments?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activity.attachments?.map((file) => <a key={file.name} href={file.dataUrl} download={file.name} className="text-xs text-emerald-700 underline">📎 {file.name}</a>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="panel p-4">
            <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
              <Fuel className="w-3 h-3 text-orange-600" />
              Scope 1 รายละเอียด
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">เชื้อเพลิงนิ่ง:</span>
                <span className="font-medium">{formatNumber(s1Stationary)} kgCO2e</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">เชื้อเพลิงเคลื่อนที่:</span>
                <span className="font-medium">{formatNumber(s1Mobile)} kgCO2e</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">รอยรั่ว (Fugitive):</span>
                <span className="font-medium">{formatNumber(s1Fugitive)} kgCO2e</span>
              </div>
            </div>
          </div>
          <div className="panel p-4">
            <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3 text-blue-600" />
              Scope 2 รายละเอียด
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">ไฟฟ้าที่ซื้อมา:</span>
                <span className="font-medium">{formatNumber(s2Electricity)} kgCO2e</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-xs text-gray-400 text-center">
            รายงานนี้ถูกสร้างโดยระบบ CFO-flow - ข้อมูลอ้างอิงจาก TGO Emission Factor
          </p>
        </div>
      </div>

      {/* Non-printable hint */}
      <div className="print-hide bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-700">
          เคล็ดลับ: ใช้ปุ่ม "พิมพ์รายงาน" แล้วเลือก "บันทึกเป็น PDF" จากเบราว์เซอร์
          เพื่อให้ได้เอกสารที่มีฟอร์แมตถูกต้องตามเทมเพลตการทวนสอบ
        </p>
      </div>
    </div>
  );
}
