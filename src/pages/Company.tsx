import React from "react";
import { useApp } from "../context/AppContext";
import { Building2, Save, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { INDUSTRIES } from "../data/industries";
import { baseYearTotalsT, formatNumber } from "../utils/calculations";
import { periodOf, assignActivityYears, ASSURANCE_LEVELS, BOUNDARY_APPROACHES } from "../types";


const ORG_INFO_TEMPLATE = [
  "1. ที่อยู่สำนักงาน:",
  "2. กลุ่มอุตสาหกรรม:",
  "3. ขนาดอุตสาหกรรม:",
  "4. ขอบข่ายก๊าซเรือนกระจกระดับองค์กร:",
  "5. วันที่จดทะเบียนนิติบุคคล:",
  "6. เลขประจำตัวผู้เสียภาษี:",
  "7. ใบอนุญาตโรงงาน:",
].join("\n");

export default function Company() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  // The form uses defaultValue, so it must mount only after the saved profile is loaded.
  // Otherwise the empty form would overwrite stored values on save.
  const formReady = !state.loading;
  const [saved, setSaved] = React.useState(false);
  const baseYearT = baseYearTotalsT(
    state.activities.filter((a) => periodOf(a) === "base"),
  );

  // Base-year selection: controlled so it reflects the saved value after the server data loads.
  const [baseYear, setBaseYear] = React.useState<string>(
    state.company.basePeriodYear ? String(state.company.basePeriodYear) : "",
  );
  React.useEffect(() => {
    setBaseYear(state.company.basePeriodYear ? String(state.company.basePeriodYear) : "");
  }, [state.company.basePeriodYear]);

  // Base-year choices: any year from (current year + 1) down to 1990, excluding the reporting year.
  // A previously saved base year is always kept in the list.
  const baseYearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const reporting = Number(state.company.reportingYear) || currentYear;
    const years: number[] = [];
    for (let y = currentYear + 1; y >= 1990; y--) {
      if (y !== reporting) years.push(y);
    }
    const saved = state.company.basePeriodYear;
    if (saved && saved !== reporting && !years.includes(saved)) {
      years.push(saved);
      years.sort((a, b) => b - a);
    }
    return years;
  }, [state.company.basePeriodYear, state.company.reportingYear]);
  const [images, setImages] = React.useState({
    companyImage: state.company.companyImage || "",
    companyLogo: state.company.companyLogo || "",
    organizationChart: state.company.organizationChart || "",
    processFlowDiagram: state.company.processFlowDiagram || "",
  });

  // Refresh previews after the company profile has been loaded from SQLite.
  React.useEffect(() => {
    setImages({
      companyImage: state.company.companyImage || "",
      companyLogo: state.company.companyLogo || "",
      organizationChart: state.company.organizationChart || "",
      processFlowDiagram: state.company.processFlowDiagram || "",
    });
  }, [state.company.companyImage, state.company.companyLogo, state.company.organizationChart, state.company.processFlowDiagram]);

  const readImage = (key: keyof typeof images) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น"); return; }
    if (file.size > 8 * 1024 * 1024) { alert("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 8 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setImages((current) => ({ ...current, [key]: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form));
    const baseYearCE = Number(baseYear);
    const hasBaseYear = Number.isInteger(baseYearCE) && baseYearCE > 0;
    if (hasBaseYear && String(baseYearCE) === String(data.reportingYear)) {
      alert("ปีฐานต้องไม่เท่ากับปีที่รายงาน");
      return;
    }
    // Thai Buddhist year, 2-digit, e.g. 2025 CE -> "ม.ค. 68 - ธ.ค. 68"
    const beShort = hasBaseYear ? String((baseYearCE + 543) % 100).padStart(2, "0") : "";
    dispatch({
      type: "SET_COMPANY",
      payload: {
        companyName: String(data.companyName || ""),
        companyNameThai: String(data.companyNameThai || ""),
        address: String(data.address || ""),
        taxId: String(data.taxId || ""),
        industry: String(data.industry || ""),
        contactPerson: String(data.contactPerson || ""),
        contactEmail: String(data.contactEmail || ""),
        contactPhone: String(data.contactPhone || ""),
        reportingYear: String(data.reportingYear || ""),
        reportingPeriodFrom: String(data.reportingPeriodFrom || ""),
        reportingPeriodTo: String(data.reportingPeriodTo || ""),
        preparedBy: String(data.preparedBy || ""),
        reviewedBy: String(data.reviewedBy || ""),
        approvedBy: String(data.approvedBy || ""),
        documentName: String(data.documentName || ""),
        documentVersion: String(data.documentVersion || ""),
        dataPeriod: String(data.dataPeriod || ""),
        basePeriod: hasBaseYear ? `ม.ค. ${beShort} - ธ.ค. ${beShort}` : "",
        basePeriodYear: hasBaseYear ? baseYearCE : undefined,
        scope1Boundary: String(data.scope1Boundary || ""),
        scope2Boundary: String(data.scope2Boundary || ""),
        scope3Boundary: String(data.scope3Boundary || ""),
        contactLocation: String(data.contactLocation || ""),
        registrationDate: String(data.registrationDate || ""),
        organizationInfo: String(data.organizationInfo || ""),
        trackingMethodology: String(data.trackingMethodology || ""),
        assuranceLevel: String(data.assuranceLevel || ""),
        materialityThreshold: String(data.materialityThreshold || ""),
        boundaryApproach: String(data.boundaryApproach || ""),
        boundaryCoverage: String(data.boundaryCoverage || ""),
        boundaryDocument: String(data.boundaryDocument || ""),
        baseYearEmissions: baseYearT,
        ...images,
      },
    });
    // Pin each record's year to the years it had before this save, so changing
    // the base year or reporting year never moves existing records to another year.
    dispatch({
      type: "SET_ACTIVITIES",
      payload: assignActivityYears(state.activities, state.company, {
        ...state.company,
        reportingYear: String(data.reportingYear || ""),
        basePeriodYear: hasBaseYear ? baseYearCE : undefined,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!formReady) {
    return <div className="max-w-3xl mx-auto text-gray-500">กำลังโหลดข้อมูลบริษัท...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">ข้อมูลบริษัท</h1>
      </div>
      <p className="text-gray-600">
        กรอกข้อมูลบริษัทเพื่อใช้ในหัวข้อรายงานใบยืนยันข้อมูล (Verification Sheet)
      </p>

      <form onSubmit={handleSubmit} className="panel p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อบริษัท (ภาษาอังกฤษ)
            </label>
            <input
              name="companyName"
              className="input"
              placeholder="例如: ABC Manufacturing Co., Ltd."
              defaultValue={state.company.companyName}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อบริษัท (ภาษาไทย)
            </label>
            <input
              name="companyNameThai"
              className="input"
              placeholder="เช่น บริษัท เอบีซี แมนูแฟก์เจอริ่ง จำกัด"
              defaultValue={state.company.companyNameThai}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ที่อยู่บริษัท
            </label>
            <textarea
              name="address"
              rows={2}
              className="input"
              defaultValue={state.company.address}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เลขผู้เสียภาษี (Tax ID)
            </label>
            <input
              name="taxId"
              className="input"
              placeholder="1234567890123"
              defaultValue={state.company.taxId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ประเภทอุตสาหกรรม
            </label>
            <select
              name="industry"
              className="input"
              defaultValue={state.company.industry || ""}
            >
              <option value="">-- เลือกประเภทอุตสาหกรรม --</option>
              {state.company.industry && !INDUSTRIES.includes(state.company.industry) && (
                <option value={state.company.industry}>{state.company.industry}</option>
              )}
              {INDUSTRIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ปีที่รายงาน
            </label>
            <input
              name="reportingYear"
              type="number"
              className="input"
              defaultValue={state.company.reportingYear}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ระยะเวลาที่รายงาน (จาก)
            </label>
            <input
              name="reportingPeriodFrom"
              type="date"
              className="input"
              defaultValue={state.company.reportingPeriodFrom}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ระยะเวลาที่รายงาน (ถึง)
            </label>
            <input
              name="reportingPeriodTo"
              type="date"
              className="input"
              defaultValue={state.company.reportingPeriodTo}
            />
          </div>
        </div>

        <hr className="border-gray-200" />

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">รูปภาพบริษัท</h2>
          <p className="text-sm text-gray-500 mb-4">แนบรูปภาพบริษัท โลโก้ และผังองค์กร เพื่อใช้ประกอบข้อมูลบริษัทและรายงาน</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              ["companyImage", "รูปภาพบริษัท"],
              ["companyLogo", "รูปโลโก้"],
              ["organizationChart", "รูปผังองค์กร"],
              ["processFlowDiagram", "รูปแผนผังกระบวนการผลิต"],
            ] as const).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-gray-200 p-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                <input type="file" accept="image/*" onChange={readImage(key)} className="input text-sm p-2" />
                <div className="mt-3 h-32 rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                  {images[key] ? <img src={images[key]} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-400">ยังไม่มีรูปภาพ</span>}
                </div>
                {images[key] && <button type="button" className="text-xs text-red-600 mt-2" onClick={() => setImages((current) => ({ ...current, [key]: "" }))}>ลบรูปภาพ</button>}
              </div>
            ))}
          </div>
        </div>

        <hr className="border-gray-200" />

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">ประวัติการปล่อยก๊าซเรือนกระจกปีฐาน</h2>
          <p className="text-sm text-gray-500 mb-4">
            คำนวณจากกิจกรรมที่กรอกในปีฐาน (tCO2e) — แก้ไขได้ที่หน้า Scope 1/2/3 โดยเลือกช่วงเวลาเป็นปีฐาน
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["total", "ผลรวม"],
              ["scope1", "Scope 1"],
              ["scope2", "Scope 2"],
              ["scope3", "Scope 3"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label} (tCO2e)</label>
                <div className="input bg-gray-50 text-gray-800">
                  {formatNumber(baseYearT[key], 2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ปีที่เก็บข้อมูล
            </label>
            <input
              name="dataPeriod"
              className="input"
              placeholder="เช่น ม.ค. 69 - ธ.ค. 69"
              defaultValue={state.company.dataPeriod || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ปีฐาน (ค.ศ.) — เลือกปีใดก็ได้
            </label>
            <select
              name="basePeriodYear"
              className="input"
              value={baseYear}
              onChange={(e) => setBaseYear(e.target.value)}
            >
              <option value="">-- เลือกปีฐาน --</option>
              {baseYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y} (พ.ศ. {y + 543})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {state.company.basePeriod ? `ปัจจุบัน: ${state.company.basePeriod}` : "ยังไม่ได้กำหนดปีฐาน"}
              {baseYearOptions.length === 0 && " · ยังไม่มีข้อมูลในระบบ"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ขอบเขตขององค์กร Scope 1
            </label>
            <textarea
              name="scope1Boundary"
              rows={3}
              className="input"
              placeholder="เฉพาะในพื้นที่โรงงานของสำนักงานใหญ่"
              defaultValue={state.company.scope1Boundary || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ขอบเขตขององค์กร Scope 2
            </label>
            <textarea
              name="scope2Boundary"
              rows={3}
              className="input"
              placeholder="แหล่งพลังงานไฟฟ้าที่ซื้อจากแหล่งพลังงานภายนอก"
              defaultValue={state.company.scope2Boundary || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ขอบเขตขององค์กร Scope 3
            </label>
            <textarea
              name="scope3Boundary"
              rows={3}
              className="input"
              placeholder="ไม่มี"
              defaultValue={state.company.scope3Boundary || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              สถานที่ติดต่อ
            </label>
            <input
              name="contactLocation"
              className="input"
              defaultValue={state.company.contactLocation || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              วันที่ขอขึ้นทะเบียน
            </label>
            <input
              name="registrationDate"
              type="date"
              className="input"
              defaultValue={state.company.registrationDate || ""}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">แนวทางการติดตามผลและการรับรอง</h2>
          <p className="text-sm text-gray-500 mb-4">ใช้ในหัวข้อ 2.7 – 2.9 ของรายงานการปล่อยและดูดกลับก๊าซเรือนกระจก</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">แนวทางที่ใช้ในการติดตามผล</label>
              <textarea
                name="trackingMethodology"
                rows={2}
                className="input"
                placeholder="เช่น ข้อกำหนดในการคำนวณและรายงานคาร์บอนฟุตพริ้นท์ขององค์กร (ฉบับปรับปรุงครั้งที่ 1, มกราคม 2564)"
                defaultValue={state.company.trackingMethodology || ""}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ระดับของการรับรอง (Level of Assurance)</label>
              <select name="assuranceLevel" className="input" defaultValue={state.company.assuranceLevel || ""}>
                <option value="">-- เลือกระดับการรับรอง --</option>
                {state.company.assuranceLevel && !ASSURANCE_LEVELS.includes(state.company.assuranceLevel) && (
                  <option value={state.company.assuranceLevel}>{state.company.assuranceLevel}</option>
                )}
                {ASSURANCE_LEVELS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ระดับความมีสาระสำคัญ (Materiality Threshold)</label>
              <input
                name="materialityThreshold"
                className="input"
                placeholder="เช่น 5%"
                defaultValue={state.company.materialityThreshold || ""}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">ขอบเขตขององค์กร</h2>
          <p className="text-sm text-gray-500 mb-4">ใช้ในหัวข้อ 3.1 ของรายงาน (ขอบเขต Scope 1–3 กรอกไว้ด้านบนแล้ว)</p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">1) แนวทางที่ใช้กำหนดขอบเขตองค์กร</label>
              <select name="boundaryApproach" className="input" defaultValue={state.company.boundaryApproach || ""}>
                <option value="">-- เลือกแนวทาง --</option>
                {state.company.boundaryApproach && !BOUNDARY_APPROACHES.includes(state.company.boundaryApproach) && (
                  <option value={state.company.boundaryApproach}>{state.company.boundaryApproach}</option>
                )}
                {BOUNDARY_APPROACHES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">2) หน่วยสาธารณูปโภค (Facility) / พื้นที่ที่ครอบคลุมในรายงาน</label>
              <textarea
                name="boundaryCoverage"
                rows={2}
                className="input"
                placeholder="เช่น โรงงาน, สำนักงาน"
                defaultValue={state.company.boundaryCoverage || ""}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">3) เอกสารยืนยันขอบเขต</label>
              <textarea
                name="boundaryDocument"
                rows={2}
                className="input"
                placeholder="เช่น ใบอนุญาตประกอบกิจการโรงงานเลขที่ 789-2453/92"
                defaultValue={state.company.boundaryDocument || ""}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ข้อมูลองค์กร
          </label>
          <textarea
            name="organizationInfo"
            rows={8}
            className="input"
            defaultValue={state.company.organizationInfo || ORG_INFO_TEMPLATE}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Name
            </label>
            <input
              name="documentName"
              className="input"
              placeholder="เช่น Verification Sheet"
              defaultValue={state.company.documentName || ""}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version
            </label>
            <input
              name="documentVersion"
              className="input"
              placeholder="เช่น v1.0"
              defaultValue={state.company.documentVersion || ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ผู้จัดทำรายงาน
            </label>
            <input
              name="preparedBy"
              className="input"
              defaultValue={state.company.preparedBy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ผู้ตรวจทาน
            </label>
            <input
              name="reviewedBy"
              className="input"
              defaultValue={state.company.reviewedBy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ผู้อนุมัติ
            </label>
            <input
              name="approvedBy"
              className="input"
              defaultValue={state.company.approvedBy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              อีเมลผู้ติดต่อ
            </label>
            <input
              name="contactEmail"
              type="email"
              className="input"
              defaultValue={state.company.contactEmail}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โทรศัพท์ผู้ติดต่อ
            </label>
            <input
              name="contactPhone"
              type="tel"
              className="input"
              defaultValue={state.company.contactPhone}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary">
            <Save className="w-4 h-4 mr-2" /> บันทึกข้อมูลบริษัท
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/")}
          >
            ยกเลิก
          </button>
        </div>

        {saved && (
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium animate-pulse">
            <CheckCircle className="w-4 h-4" />
            บันทึกข้อมูลเรียบร้อยแล้ว
          </div>
        )}
      </form>

    </div>
  );
}
