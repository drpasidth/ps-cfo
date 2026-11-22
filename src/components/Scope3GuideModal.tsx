import React from "react";
import { X } from "lucide-react";
import { SCOPE3_CATEGORY_LABELS, type Scope3Category } from "../data/scope3Reference";
import { SCOPE3_GUIDE } from "../data/scope3Guide";

interface Props {
  category: Scope3Category;
  efCount: number; // number of EF items available for this category
  onClose: () => void;
}

const STEPS = [
  "เลือกหมวดหมู่ในช่อง \"หมวดหมู่\" ของฟอร์ม (หัวข้อฟอร์มจะเปลี่ยนตามหมวดที่เลือก)",
  "เลือกเดือนที่เกิดกิจกรรม",
  "พิมพ์คำค้นหา EF (ชื่อวัสดุ/กิจกรรม) แล้วเลือกรายการที่ตรงกับกิจกรรมจริง",
  "ใส่ปริมาณกิจกรรมตามหน่วยของ EF ที่เลือก",
  "กดบันทึก ระบบจะคำนวณ kgCO2e = ปริมาณ × EF ให้อัตโนมัติ",
];

export default function Scope3GuideModal({ category, efCount, onClose }: Props) {
  const guide = SCOPE3_GUIDE[category];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="panel max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 bg-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-900">{SCOPE3_CATEGORY_LABELS[category]}</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>

        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-1">หมวดนี้ครอบคลุมอะไร</h4>
          <p className="text-sm text-gray-700">{guide.what}</p>
        </section>

        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-1">วิธีบันทึกรายการ</h4>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">ตัวอย่าง</h4>
          <div className="space-y-3">
            {guide.examples.map((ex) => (
              <div key={ex.title} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <div className="font-semibold text-gray-900">{ex.title}</div>
                <div className="text-gray-700">
                  <span className="font-medium">กิจกรรม:</span> {ex.activity}
                </div>
                <div className="text-gray-700">
                  <span className="font-medium">กรอกในฟอร์ม:</span> {ex.input}
                </div>
                <div className="text-gray-700">
                  <span className="font-medium">หา EF:</span> {ex.ef}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-1">EF ในหมวดนี้</h4>
          {efCount > 0 ? (
            <p className="text-sm text-gray-700">
              มี EF {efCount} รายการในหมวดนี้ ดูรายการได้จากช่องค้นหา EF ในฟอร์ม
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              ยังไม่มี EF ในหมวดนี้ รายการประเภทกิจกรรมจะว่างจนกว่าจะเพิ่ม EF ของหมวดนี้ลงในตาราง EF Scope 3
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
