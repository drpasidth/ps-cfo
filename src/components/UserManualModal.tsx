import { useEffect, useState } from "react";
import { X, Printer, BookOpen, Lightbulb } from "lucide-react";
import { manualSections, manualTitle, manualVersion } from "../data/userManual";
import "../userManual.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Build HTML content for print window
function buildPrintHTML() {
  const printedAt = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  
  const sectionsHtml = manualSections.map((s) => {
    let html = `<section class="manual-section">
      <h2>${s.title}</h2>`;
    
    if (s.paragraphs) {
      s.paragraphs.forEach((p) => {
        html += `<p>${p}</p>`;
      });
    }
    
    if (s.items) {
      html += `<ul>`;
      s.items.forEach((it) => {
        html += `<li>${it}</li>`;
      });
      html += `</ul>`;
    }
    
    if (s.figure) {
      html += `<figure class="manual-figure">
        <img src="${s.figure.src}" alt="${s.figure.caption}" />
        <figcaption>${s.figure.caption}</figcaption>
      </figure>`;
    }
    
    if (s.tips) {
      s.tips.forEach((t) => {
        html += `<div class="manual-tip"><span class="lightbulb">💡</span><p>${t}</p></div>`;
      });
    }
    
    html += `</section>`;
    return html;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>${manualTitle} - พิมพ์</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body { 
      font-family: "Sarabun", "Noto Sans Thai", system-ui, sans-serif; 
      font-size: 12pt; 
      line-height: 1.7; 
      color: #111; 
      background: #fff; 
      padding: 0; 
      margin: 0; 
    }
    .manual-cover { border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px; }
    .manual-cover h1 { font-size: 24pt; font-weight: 700; margin: 0 0 8px; color: #065f46; }
    .manual-cover .meta { font-size: 9pt; color: #6b7280; }
    .manual-cover .toc { margin-top: 12px; font-size: 10pt; color: #4b5563; }
    .manual-section { margin-bottom: 24px; page-break-inside: avoid; }
    .manual-section h2 { font-size: 13pt; font-weight: 700; color: #047857; margin: 0 0 8px; page-break-after: avoid; }
    .manual-section p { margin: 0 0 10px; color: #374151; }
    .manual-section ul { margin: 0 0 10px; padding-left: 20px; color: #374151; }
    .manual-section li { margin: 4px 0; }
    .manual-figure { margin: 16px 0; page-break-inside: avoid; text-align: center; }
    .manual-figure img { max-width: 100%; max-height: 90mm; border: 1px solid #e5e7eb; border-radius: 8px; }
    .manual-figure figcaption { margin-top: 8px; font-size: 9pt; color: #6b7280; }
    .manual-tip { display: flex; gap: 8px; padding: 10px 12px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; margin: 10px 0; page-break-inside: avoid; }
    .manual-tip .lightbulb { font-size: 11pt; flex-shrink: 0; margin-top: 2px; }
    .manual-tip p { margin: 0; color: #92400e; font-size: 10.5pt; }
    .manual-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9pt; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 4px; background: #fff; }
    body { padding-bottom: 28px; }
    @media print {
      .no-print { display: none !important; }
      body { padding-bottom: 28px; }
    }
  </style>
</head>
<body>
  <div class="manual-cover">
    <h1>${manualTitle}</h1>
    <div class="meta">${manualVersion} · พิมพ์เมื่อ ${printedAt}</div>
    <div class="toc">สารบัญ: ${manualSections.map((s, i) => (i > 0 ? " · " : "") + s.title.replace(/^\d+\.\s*/, "")).join("")}</div>
  </div>
  ${sectionsHtml}
  <div class="manual-footer">Copy Right @ PS Evolution 2027 - psevolutionth@gmail.com</div>
  <script>
    // Auto-print when loaded
    window.onload = function() {
      window.print();
      // Close after print dialog (user may cancel)
      setTimeout(function() { window.close(); }, 1000);
    };
  </script>
</body>
</html>`;
}

export default function UserManualModal({ open, onClose }: Props) {
  const [activeId, setActiveId] = useState(manualSections[0].id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function jumpTo(id: string) {
    setActiveId(id);
    document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePrint() {
    // Open print-friendly window
    const printHtml = buildPrintHTML();
    const printWindow = window.open("", "_blank", "width=800,height=1000");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      // Fallback if popup blocked
      alert("โปรดอนุญาตป็อปอัป (popup) เพื่อพิมพ์คู่มือ");
    }
  }

  const printedAt = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div
      className="manual-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="manual-modal bg-white text-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={manualTitle}
      >
        {/* Header */}
        <div className="manual-no-print flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold text-base">{manualTitle}</h2>
            <span className="text-xs text-gray-500">{manualVersion}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="btn-primary !py-1.5 !px-3 text-xs gap-1.5"
              title="พิมพ์ หรือบันทึกเป็นไฟล์ PDF (จะเปิดหน้าต่างใหม่สำหรับพิมพ์)"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ / บันทึกเป็น PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100"
              title="ปิด (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Table of contents */}
          <nav className="manual-no-print w-60 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-3">
            {manualSections.map((s) => (
              <button
                key={s.id}
                onClick={() => jumpTo(s.id)}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                  activeId === s.id
                    ? "bg-emerald-50 text-emerald-700 font-semibold border-r-4 border-emerald-600"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {s.title}
              </button>
            ))}
          </nav>

          {/* Content: all sections for screen viewing */}
          <div id="user-manual-print" className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-6 text-sm leading-relaxed">
            <div className="manual-cover pb-4 border-b border-gray-200">
              <h1 className="text-2xl font-bold">{manualTitle}</h1>
              <p className="text-xs text-gray-500">
                {manualVersion} · พิมพ์เมื่อ {printedAt}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                สารบัญ:{" "}
                {manualSections.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && " · "}
                    {s.title.replace(/^\d+\.\s*/, "")}
                  </span>
                ))}
              </p>
            </div>
            {manualSections.map((s) => (
              <section key={s.id} id={`manual-${s.id}`} className="manual-section scroll-mt-2 space-y-2">
                <h2 className="text-base font-bold text-emerald-700 mb-2">{s.title}</h2>
                {s.paragraphs?.map((p, i) => (
                  <p key={i} className="mb-2 text-gray-700">
                    {p}
                  </p>
                ))}
                {s.items && (
                  <ul className="list-disc pl-6 space-y-1 text-gray-700">
                    {s.items.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                )}
                {s.figure && (
                  <figure className="manual-figure my-3">
                    <img src={s.figure.src} alt={s.figure.caption} className="w-full rounded-lg border border-gray-200" loading="lazy" />
                    <figcaption className="mt-1 text-center text-xs text-gray-500">{s.figure.caption}</figcaption>
                  </figure>
                )}
                {s.tips?.map((t, i) => (
                  <div key={i} className="manual-tip flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-gray-800">
                    <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <p>{t}</p>
                  </div>
                ))}
              </section>
            ))}
            <div className="pt-4 mt-2 border-t border-gray-200 text-center text-xs text-gray-500">
              Copy Right @ PS Evolution 2027 - psevolutionth@gmail.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
