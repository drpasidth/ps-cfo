import React from "react";
import { useApp } from "../context/AppContext";
import { ClipboardCheck, Save, CheckCircle } from "lucide-react";
import type { CalibrationRecord, QualityRole } from "../types";

const CALIBRATION_SCOPES = ["ประเภทที่ 1", "ประเภทที่ 2", "ประเภทที่ 3", "รายงานแยก"];
const EMPTY_ROLE: QualityRole = { role: "", name: "", position: "", duty: "" };
const EMPTY_CALIBRATION: CalibrationRecord = { scope: CALIBRATION_SCOPES[0], equipment: "", calibrator: "", accuracy: "", measuredError: "", reference: "" };

export default function QualityManagement() {
  const { state, dispatch } = useApp();
  const [saved, setSaved] = React.useState(false);
  const [qualityRoles, setQualityRoles] = React.useState<QualityRole[]>(state.company.qualityRoles ?? []);
  const [qualityDiagrams, setQualityDiagrams] = React.useState<string[]>(state.company.qualityDiagrams ?? []);
  const [calibrations, setCalibrations] = React.useState<CalibrationRecord[]>(state.company.calibrationRecords ?? []);

  // Reload the lists once the saved profile arrives from the server.
  React.useEffect(() => {
    setQualityRoles(state.company.qualityRoles ?? []);
    setQualityDiagrams(state.company.qualityDiagrams ?? []);
    setCalibrations(state.company.calibrationRecords ?? []);
  }, [state.company.qualityRoles, state.company.qualityDiagrams, state.company.calibrationRecords]);

  const addQualityDiagrams = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const valid = files.filter((file) => {
      if (!file.type.startsWith("image/")) { alert(`${file.name} ไม่ใช่ไฟล์รูปภาพ`); return false; }
      if (file.size > 8 * 1024 * 1024) { alert(`${file.name} มีขนาดเกิน 8 MB`); return false; }
      return true;
    });
    const urls = await Promise.all(
      valid.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setQualityDiagrams((current) => [...current, ...urls]);
  };

  const updateRole = (index: number, patch: Partial<QualityRole>) =>
    setQualityRoles((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateCalibration = (index: number, patch: Partial<CalibrationRecord>) =>
    setCalibrations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const handleSave = () => {
    dispatch({
      type: "SET_COMPANY",
      payload: {
        qualityRoles: qualityRoles.filter((r) => Object.values(r).some((v) => v.trim() !== "")),
        qualityDiagrams,
        calibrationRecords: calibrations.filter((r) => Object.values(r).some((v) => v.trim() !== "")),
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">การจัดการคุณภาพของข้อมูล (ข้อ 7)</h1>
      </div>
      <p className="text-gray-600">ข้อมูลในหัวข้อนี้จะถูกนำไปแสดงในหัวข้อ 7 ของรายงาน TCFO_R_02</p>

      <div className="panel p-6 space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">7.1 โครงสร้างของระบบการจัดการคุณภาพของข้อมูล</h2>
          <p className="text-sm text-gray-500 mb-4">ระบุบทบาท ชื่อ-สกุล ตำแหน่ง และหน้าที่ของผู้เกี่ยวข้องกับข้อมูล</p>
          <div className="space-y-3">
            {qualityRoles.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-lg border border-gray-200 p-3">
                <input className="input" placeholder="บทบาท" value={row.role} onChange={(e) => updateRole(i, { role: e.target.value })} />
                <input className="input" placeholder="ชื่อ-สกุล" value={row.name} onChange={(e) => updateRole(i, { name: e.target.value })} />
                <input className="input" placeholder="ตำแหน่ง" value={row.position} onChange={(e) => updateRole(i, { position: e.target.value })} />
                <input className="input" placeholder="หน้าที่" value={row.duty} onChange={(e) => updateRole(i, { duty: e.target.value })} />
                <button type="button" className="text-xs text-red-600" onClick={() => setQualityRoles((rows) => rows.filter((_, idx) => idx !== i))}>ลบแถว</button>
              </div>
            ))}
          </div>
          <button type="button" className="text-sm text-emerald-700 mt-3" onClick={() => setQualityRoles((rows) => [...rows, { ...EMPTY_ROLE }])}>+ เพิ่มบทบาท</button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">7.2 แผนผังการจัดการคุณภาพของข้อมูล</h2>
          <p className="text-sm text-gray-500 mb-4">แนบรูปแผนผังการจัดการคุณภาพของข้อมูล (แนบได้ไม่จำกัดจำนวนภาพ)</p>
          <input type="file" accept="image/*" multiple onChange={addQualityDiagrams} className="input text-sm p-2" />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {qualityDiagrams.map((url, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-2">
                <div className="h-32 rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                  <img src={url} alt={`แผนผัง ${i + 1}`} className="max-h-full max-w-full object-contain" />
                </div>
                <button type="button" className="text-xs text-red-600 mt-2" onClick={() => setQualityDiagrams((list) => list.filter((_, idx) => idx !== i))}>ลบรูปภาพ</button>
              </div>
            ))}
          </div>
          {qualityDiagrams.length === 0 && <p className="text-xs text-gray-400 mt-2">ยังไม่มีรูปภาพ</p>}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">7.3 บันทึกการสอบเทียบวัดมาตรฐานของอุปกรณ์/เครื่องมือวัด (Calibration Record)</h2>
          <p className="text-sm text-gray-500 mb-4">ระบุรายละเอียดการสอบเทียบของอุปกรณ์ตรวจวัดที่ใช้ในการเก็บข้อมูลกิจกรรม</p>
          <div className="space-y-3">
            {calibrations.map((row, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3">
                <select className="input" value={row.scope} onChange={(e) => updateCalibration(i, { scope: e.target.value })}>
                  {CALIBRATION_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className="input" placeholder="อุปกรณ์/เครื่องมือวัด (เครื่องที่)" value={row.equipment} onChange={(e) => updateCalibration(i, { equipment: e.target.value })} />
                <input className="input" placeholder="ผู้ทำการสอบเทียบ / แหล่งที่เทียบวัด" value={row.calibrator} onChange={(e) => updateCalibration(i, { calibrator: e.target.value })} />
                <input className="input" placeholder="ความแม่นยำที่ยอมรับได้หรือที่กำหนดไว้" value={row.accuracy} onChange={(e) => updateCalibration(i, { accuracy: e.target.value })} />
                <input className="input" placeholder="ค่าความผิดพลาดของอุปกรณ์ที่วัดได้" value={row.measuredError} onChange={(e) => updateCalibration(i, { measuredError: e.target.value })} />
                <input className="input" placeholder="เอกสารอ้างอิง" value={row.reference} onChange={(e) => updateCalibration(i, { reference: e.target.value })} />
                <button type="button" className="text-xs text-red-600 md:col-span-2 text-left" onClick={() => setCalibrations((rows) => rows.filter((_, idx) => idx !== i))}>ลบรายการ</button>
              </div>
            ))}
          </div>
          <button type="button" className="text-sm text-emerald-700 mt-3" onClick={() => setCalibrations((rows) => [...rows, { ...EMPTY_CALIBRATION }])}>+ เพิ่มรายการสอบเทียบ</button>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> บันทึกข้อ 7
          </button>
          {saved && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle className="w-4 h-4" /> บันทึกแล้ว</span>}
        </div>
      </div>
    </div>
  );
}
