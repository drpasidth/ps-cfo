import { Link } from "react-router-dom";
import { Bot, Check, ClipboardCheck, Database, Download, Factory, FileText, Fuel, Lock, RefreshCw, Zap } from "lucide-react";

// Public landing page. Package list mirrors the default packages in server.cjs (DEFAULT_PACKAGES).
// The admin can change prices in the database, so keep these values in sync when prices change.
const PACKAGES = [
  {
    code: "A",
    name: "Package A",
    price: 990,
    description: "Scope 1, Scope 2 และ Verification Sheet",
    features: ["scope1", "scope2", "verification"],
  },
  {
    code: "AA",
    name: "Package AA",
    price: 1490,
    description: "Scope 1, Scope 2, Verification Sheet และรายงาน Word",
    features: ["scope1", "scope2", "verification", "report_word"],
  },
  {
    code: "B",
    name: "Package B",
    price: 2490,
    description: "Scope 1-3, Verification Sheet และ AI Assistant",
    features: ["scope1", "scope2", "scope3", "verification", "ai"],
  },
  {
    code: "BB",
    name: "Package BB",
    price: 3490,
    description: "Scope 1-3, Verification Sheet, รายงาน Word และ AI Assistant",
    features: ["scope1", "scope2", "scope3", "verification", "report_word", "ai"],
  },
] as const;

const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "scope1", label: "Scope 1 (เชื้อเพลิงนิ่ง เคลื่อนที่ รอยรั่ว)" },
  { key: "scope2", label: "Scope 2 (ไฟฟ้าที่ซื้อมา)" },
  { key: "scope3", label: "Scope 3 (15 หมวด + การประเมินความมีนัยสำคัญ)" },
  { key: "verification", label: "Verification Sheet (FR-04 / FR-05)" },
  { key: "report_word", label: "รายงาน Word (.docx) ตามแบบ TGO TCFO_R_02" },
  { key: "ai", label: "AI Assistant (ถามตอบการคำนวณคาร์บอน)" },
];

const FEATURES = [
  {
    icon: Factory,
    title: "Scope 1 – การปล่อยทางตรง",
    text: "บันทึกการเผาไหม้เชื้อเพลิงนิ่ง/เคลื่อนที่ และการรั่วไหลของสารทำความเย็น พร้อมค่า Emission Factor ของ TGO",
  },
  {
    icon: Zap,
    title: "Scope 2 – ไฟฟ้าที่ซื้อมา",
    text: "คำนวณการปล่อยจากปริมาณไฟฟ้าที่ใช้ รวมถึงไฟฟ้าจากเซลล์แสงอาทิตย์ที่ผลิตเองภายในองค์กร",
  },
  {
    icon: Fuel,
    title: "Scope 3 – ห่วงโซ่อุปทาน",
    text: "ครอบคลุม 15 หมวดของ GHG Protocol พร้อมตารางเกณฑ์และการประเมินความมีนัยสำคัญ",
  },
  {
    icon: ClipboardCheck,
    title: "Verification Sheet",
    text: "สร้างใบยืนยันข้อมูลตามแนวทาง TGO และ ISO 14064-1 ทั้งทศนิยม 2 ตำแหน่งและปัดขึ้นเป็นจำนวนเต็ม",
  },
  {
    icon: FileText,
    title: "รายงาน Word / PDF",
    text: "ดาวน์โหลดรายงานการปล่อยก๊าซเรือนกระจกเป็นไฟล์ .docx ตามโครงสร้างแบบฟอร์ม TGO",
  },
  {
    icon: Database,
    title: "ฐานข้อมูลค่า EF",
    text: "ค่า Emission Factor ของ TGO, DEFRA (การเดินทาง) และ Scope 3 พร้อมตารางอ้างอิงให้ตรวจสอบได้",
  },
  {
    icon: Download,
    title: "ส่งออกและสำรองข้อมูล",
    text: "ส่งออกไฟล์ CSV / Excel และสำรองข้อมูลเป็น JSON เพื่อกู้คืนหรือส่งต่อให้ผู้ทวนสอบ",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    text: "ผู้ช่วยตอบคำถามเรื่องการคำนวณ Scope 1–3, เลือกค่า Emission Factor และอธิบายผลลัพธ์ได้ทันทีจากหน้าจอใดก็ได้",
  },
  {
    icon: Lock,
    title: "แยกข้อมูลรายบริษัท",
    text: "แต่ละองค์กรมีฐานข้อมูลของตนเอง ผู้ดูแลระบบอนุมัติบัญชีและจัดการแพ็กเกจได้",
  },
  {
    icon: RefreshCw,
    title: "ปีปัจจุบันและปีฐาน",
    text: "เปรียบเทียบการปล่อยของปีปัจจุบันกับปีฐาน และกรอกข้อมูลย้อนหลังได้ตามรอบการรายงาน",
  },
];

const STEPS = [
  { n: "1", title: "เก็บข้อมูลกิจกรรม", text: "ปริมาณเชื้อเพลิง ไฟฟ้า ค่าเดินทาง วัตถุดิบ" },
  { n: "2", title: "คูณค่า EF", text: "กิจกรรม × Emission Factor" },
  { n: "3", title: "แปลงเป็น CO2e", text: "รวมก๊าซทุกชนิดเป็นหน่วยเทียบเท่า CO2" },
  { n: "4", title: "รวมตามขอบเขต", text: "Scope 1 + 2 + 3 พร้อมปัดขึ้นตามสูตร FR-05" },
  { n: "5", title: "ทวนสอบ", text: "Verification Sheet ตามแนวทาง TGO" },
  { n: "6", title: "ส่งออกรายงาน", text: "Word / PDF / Excel พร้อมยื่นผู้ทวนสอบ" },
];

const SCOPE_COLORS = { scope1: "#ea580c", scope2: "#2563eb", scope3: "#7c3aed" };

function Infographic() {
  // Flow: data -> factor -> CO2e -> scopes -> verification -> report
  // 6 boxes must fit inside the 1000-wide viewBox: 5 + 6*148 + 5*20 = 993.
  const boxW = 148;
  const boxH = 112;
  const gap = 20;
  const startX = 5;
  const y = 60;
  return (
    <svg viewBox="0 0 1000 380" className="w-full h-auto" role="img" aria-label="ขั้นตอนการคำนวณคาร์บอนฟุตพริ้นท์">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#059669" />
        </marker>
      </defs>
      <text x="500" y="30" textAnchor="middle" fontSize="20" fontWeight="700" fill="#065f46">
        จากข้อมูลกิจกรรมสู่รายงานคาร์บอนฟุตพริ้นท์
      </text>
      {STEPS.map((s, i) => {
        const left = startX + i * (boxW + gap);
        return (
          <g key={s.n}>
            <rect x={left} y={y} width={boxW} height={boxH} rx="14" fill="#ecfdf5" stroke="#10b981" strokeWidth="2" />
            <circle cx={left + 22} cy={y + 22} r="14" fill="#059669" />
            <text x={left + 22} y={y + 27} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">
              {s.n}
            </text>
            <text x={left + 12} y={y + 56} fontSize="12.5" fontWeight="700" fill="#064e3b" fontFamily="Tahoma, sans-serif">
              {s.title}
            </text>
            <foreignObject x={left + 8} y={y + 62} width={boxW - 16} height={48}>
              <div style={{ fontSize: "11.5px", color: "#374151", lineHeight: 1.3, fontFamily: "Tahoma, sans-serif" }}>{s.text}</div>
            </foreignObject>
            {i < STEPS.length - 1 && (
              <line x1={left + boxW + 3} y1={y + boxH / 2} x2={left + boxW + gap - 3} y2={y + boxH / 2} stroke="#059669" strokeWidth="2" markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}

      {/* Scope summary cards */}
      {[
        { label: "Scope 1", color: SCOPE_COLORS.scope1, desc: "การปล่อยทางตรง" },
        { label: "Scope 2", color: SCOPE_COLORS.scope2, desc: "ไฟฟ้าที่ซื้อมา" },
        { label: "Scope 3", color: SCOPE_COLORS.scope3, desc: "ห่วงโซ่อุปทาน" },
      ].map((s, i) => {
        const x = 120 + i * 260;
        return (
          <g key={s.label}>
            <rect x={x} y="220" width="220" height="110" rx="16" fill="#fff" stroke={s.color} strokeWidth="2.5" />
            <rect x={x} y="220" width="220" height="12" rx="6" fill={s.color} />
            <text x={x + 110} y="268" textAnchor="middle" fontSize="22" fontWeight="800" fill={s.color}>
              {s.label}
            </text>
            <text x={x + 110} y="296" textAnchor="middle" fontSize="14" fill="#374151">
              {s.desc}
            </text>
            <text x={x + 110} y="318" textAnchor="middle" fontSize="12" fill="#6b7280">
              kgCO2e → tCO2e
            </text>
          </g>
        );
      })}
      <text x="500" y="365" textAnchor="middle" fontSize="13" fill="#6b7280">
        รวม Scope 1 + 2 (+ 3) = ผลรวมการปล่อยก๊าซเรือนกระจกขององค์กร
      </text>
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="#top" className="font-bold text-emerald-700 text-lg">CFO Carbon</a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <a href="#features" className="hover:text-emerald-700">ฟีเจอร์</a>
            <a href="#infographic" className="hover:text-emerald-700">ขั้นตอน</a>
            <a href="#packages" className="hover:text-emerald-700">แพ็กเกจ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
              เข้าสู่ระบบ
            </Link>
            <Link to="/signup" className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700">
              สมัครใช้งาน
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <div className="max-w-6xl mx-auto px-5 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <span className="inline-block text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-full px-3 py-1">
              ตามแนวทาง TGO และ ISO 14064-1
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              คำนวณและรายงาน <span className="text-emerald-600">คาร์บอนฟุตพริ้นท์องค์กร</span> ให้ครบจบในที่เดียว
            </h1>
            <p className="text-lg text-gray-600">
              ตั้งแต่เก็บข้อมูล Scope 1–3 คำนวณด้วยค่า Emission Factor ของ TGO ไปจนถึงสร้าง Verification Sheet
              และรายงาน Word พร้อมส่งผู้ทวนสอบ
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/signup" className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
                เริ่มทดลองใช้ฟรี 1 เดือน
              </Link>
              <a href="#packages" className="px-6 py-3 rounded-lg border border-gray-300 font-medium hover:bg-white">
                ดูแพ็กเกจและราคา
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { v: "3", l: "ขอบเขต (Scope 1–3)" },
              { v: "15", l: "หมวด Scope 3" },
              { v: "2", l: "รูปแบบการปัดเศษ (FR-04/05)" },
              { v: "4", l: "แพ็กเกจให้เลือก" },
            ].map((s) => (
              <div key={s.l} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
                <p className="text-4xl font-extrabold text-emerald-600">{s.v}</p>
                <p className="text-sm text-gray-600 mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-3xl font-bold text-center">ฟีเจอร์ทั้งหมด</h2>
          <p className="text-center text-gray-600 mt-2">ทุกขั้นตอนที่จำเป็นสำหรับการจัดทำรายงานคาร์บอนฟุตพริ้นท์ขององค์กร</p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold mt-4">{f.title}</h3>
                  <p className="text-sm text-gray-600 mt-2">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Infographic */}
      <section id="infographic" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-3xl font-bold text-center">ขั้นตอนการทำงานในระบบ</h2>
          <p className="text-center text-gray-600 mt-2">จากข้อมูลดิบสู่ใบยืนยันและรายงานที่พร้อมทวนสอบ</p>
          <div className="mt-10 bg-white rounded-3xl border border-gray-200 shadow-sm p-4 md:p-8">
            <Infographic />
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {[
              { c: SCOPE_COLORS.scope1, t: "Scope 1", d: "เชื้อเพลิงที่เผาไหม้ในโรงงาน ยานพาหนะขององค์กร และสารทำความเย็นที่รั่วไหล" },
              { c: SCOPE_COLORS.scope2, t: "Scope 2", d: "ไฟฟ้าที่องค์กรซื้อจากภายนอกมาใช้ในอาคารและโรงงาน" },
              { c: SCOPE_COLORS.scope3, t: "Scope 3", d: "กิจกรรมในห่วงโซ่อุปทาน เช่น วัตถุดิบ การเดินทาง การขนส่ง และของเสีย" },
            ].map((s) => (
              <div key={s.t} className="bg-white rounded-2xl border-l-4 p-5" style={{ borderColor: s.c }}>
                <p className="font-bold" style={{ color: s.c }}>{s.t}</p>
                <p className="text-sm text-gray-600 mt-1">{s.d}</p>
              </div>
            ))}
          </div>
          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3 bg-white border border-gray-200 rounded-xl p-4">
                <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-gray-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="py-20">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-3xl font-bold text-center">แพ็กเกจและราคา</h2>
          <p className="text-center text-gray-600 mt-2">
            ทดลองใช้ฟรี <span className="font-semibold text-emerald-700">1 เดือน</span> ทุกแพ็กเกจ · ราคาต่อเดือน ชำระผ่าน PromptPay หลังครบกำหนดทดลองใช้
          </p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PACKAGES.map((p, i) => (
              <div
                key={p.code}
                className={`rounded-2xl border p-6 flex flex-col ${
                  i === 2 ? "border-emerald-500 ring-2 ring-emerald-200 shadow-lg" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">{p.code}</span>
                  {i === 2 && <span className="text-xs text-emerald-700 font-semibold">ยอดนิยม</span>}
                </div>
                <p className="font-bold text-lg mt-3">{p.name}</p>
                <p className="mt-2">
                  <span className="text-3xl font-extrabold">{p.price.toLocaleString("th-TH")}</span>
                  <span className="text-sm text-gray-500"> บาท / เดือน</span>
                </p>
                <p className="mt-2 inline-block self-start text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
                  ทดลองใช้ฟรี 1 เดือน
                </p>
                <p className="text-sm text-gray-600 mt-3 min-h-[2.5rem]">{p.description}</p>
                <ul className="mt-4 space-y-2 text-sm flex-1">
                  {FEATURE_ROWS.filter((f) => (p.features as readonly string[]).includes(f.key)).map((f) => (
                    <li key={f.key} className="flex gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className="mt-6 text-center py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
                  เลือกแพ็กเกจ {p.code}
                </Link>
              </div>
            ))}
          </div>

          {/* Comparison matrix */}
          <div className="mt-12 overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-semibold">ฟีเจอร์</th>
                  {PACKAGES.map((p) => (
                    <th key={p.code} className="p-3 font-semibold text-center">{p.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((f) => (
                  <tr key={f.key} className="border-t border-gray-200">
                    <td className="p-3">{f.label}</td>
                    {PACKAGES.map((p) => (
                      <td key={p.code} className="p-3 text-center">
                        {(p.features as readonly string[]).includes(f.key) ? (
                          <Check className="w-4 h-4 text-emerald-600 inline" />
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-emerald-600 text-white">
        <div className="max-w-4xl mx-auto px-5 text-center space-y-5">
          <h2 className="text-3xl font-bold">พร้อมจัดทำรายงานคาร์บอนฟุตพริ้นท์แล้วหรือยัง?</h2>
          <p className="text-emerald-50">สมัครวันนี้รับการทดลองใช้ฟรี 1 เดือน ทุกแพ็กเกจ ผู้ดูแลระบบจะอนุมัติบัญชีให้เร็ว ๆ นี้</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="px-6 py-3 rounded-lg bg-white text-emerald-700 font-semibold hover:bg-emerald-50">
              สมัครใช้งาน
            </Link>
            <Link to="/login" className="px-6 py-3 rounded-lg border border-white/60 font-semibold hover:bg-emerald-700">
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-gray-500">
        CFO Carbon Footprint for Organization · ข้อมูลอ้างอิงจาก TGO Emission Factor
      </footer>
    </div>
  );
}
