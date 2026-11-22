import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiJson } from "../api";
import { useAuth } from "../context/AuthContext";
import { FEATURES, type FeatureKey } from "../utils/packages";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isSuperuser: boolean;
  approved: boolean;
  createdAt: string;
}

interface AdminTenant {
  id: string;
  name: string;
  createdAt: string;
  companyName: string;
  activityCount: number;
  packageId: string | null;
  subscription: { status: "trial" | "active" | "expired"; trialEndsAt: string | null; paidUntil: string | null };
  users: AdminUser[];
}

function subscriptionLabel(sub: AdminTenant["subscription"] | undefined): string {
  if (!sub) return "-";
  if (sub.status === "trial") return `ทดลองใช้ถึง ${sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("th-TH") : "-"}`;
  if (sub.status === "active") return `ใช้งานได้ถึง ${sub.paidUntil ? new Date(sub.paidUntil).toLocaleDateString("th-TH") : "-"}`;
  return "หมดอายุ";
}

interface AdminPayment {
  id: string;
  amount: number;
  package_id: string;
  created_at: string;
  slip: string | null;
  tenant_name: string;
}

interface AdminPackage {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  features: FeatureKey[];
  maxUsers: number;
}

// Number of users (including the tenant admin) a package allows.
function MaxUsersField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      จำนวนผู้ใช้งานสูงสุด
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        aria-label="จำนวนผู้ใช้งานสูงสุด"
      />
      <span className="text-gray-400">คน</span>
    </label>
  );
}

export default function Admin() {
  const { session } = useAuth();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMsg, setWebhookMsg] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [promptpayName, setPromptpayName] = useState("");
  const [promptpayMsg, setPromptpayMsg] = useState("");
  const [superuserEmail, setSuperuserEmail] = useState("");
  const [superuserMsg, setSuperuserMsg] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [testQr, setTestQr] = useState<{ amount: number; accountName: string; qrDataUrl: string } | null>(null);
  const [testingQr, setTestingQr] = useState(false);

  const isSuperuser = !!session?.user.isSuperuser;

  function load() {
    apiJson<AdminTenant[]>("/api/admin/tenants")
      .then(setTenants)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
    apiJson<AdminPayment[]>("/api/admin/payments")
      .then(setPayments)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดรายการชำระเงินไม่สำเร็จ"));
    apiJson<AdminPackage[]>("/api/admin/packages")
      .then(setPackages)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดแพ็กเกจไม่สำเร็จ"));
  }

  useEffect(() => {
    if (isSuperuser) {
      load();
      apiJson<{ aiWebhookUrl: string; promptpayId: string; promptpayName: string; superuserEmail: string }>("/api/admin/settings")
        .then((s) => {
          setWebhookUrl(s.aiWebhookUrl);
          setPromptpayId(s.promptpayId);
          setPromptpayName(s.promptpayName);
          setSuperuserEmail(s.superuserEmail);
        })
        .catch(() => {});
    }
  }, [isSuperuser]);

  async function testPromptpay() {
    setError("");
    setTestingQr(true);
    try {
      const res = await apiJson<{ amount: number; accountName: string; qrDataUrl: string }>("/api/admin/promptpay-test");
      setTestQr(res);
    } catch (err) {
      setTestQr(null);
      setError(err instanceof Error ? err.message : "สร้าง QR ทดสอบไม่สำเร็จ");
    } finally {
      setTestingQr(false);
    }
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWebhookMsg("");
    try {
      await apiJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ aiWebhookUrl: webhookUrl.trim() }),
      });
      setWebhookMsg("บันทึก AI webhook แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function sendTestEmail() {
    setError("");
    setSuperuserMsg("");
    setTestEmailSending(true);
    try {
      const res = await apiJson<{ ok: boolean; to: string }>("/api/admin/test-email", {
        method: "POST",
        body: JSON.stringify({ to: superuserEmail.trim() }),
      });
      setSuperuserMsg(`ส่งอีเมลทดสอบไปที่ ${res.to} แล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งอีเมลทดสอบไม่สำเร็จ");
    } finally {
      setTestEmailSending(false);
    }
  }

  async function saveSuperuserEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuperuserMsg("");
    try {
      await apiJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ superuserEmail: superuserEmail.trim() }),
      });
      setSuperuserMsg("บันทึกอีเมลผู้ดูแลระบบแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function savePromptpay(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPromptpayMsg("");
    try {
      await apiJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ promptpayId: promptpayId.trim(), promptpayName: promptpayName.trim() }),
      });
      setPromptpayMsg("บันทึกบัญชี PromptPay แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function confirmPayment(id: string) {
    setError("");
    setMessage("");
    try {
      await apiJson(`/api/admin/payments/${id}/confirm`, { method: "POST" });
      setMessage("ยืนยันการชำระเงินแล้ว อนุมัติบัญชี และต่ออายุสมาชิก 1 เดือน");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยืนยันไม่สำเร็จ");
    }
  }

  async function rejectPayment(id: string) {
    setError("");
    setMessage("");
    try {
      await apiJson(`/api/admin/payments/${id}/reject`, { method: "POST" });
      setMessage("ปฏิเสธรายการชำระเงินแล้ว");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
    }
  }

  async function deleteTenant(t: AdminTenant) {
    const label = t.companyName || t.name;
    if (!window.confirm(`ลบบริษัท "${label}" และผู้ใช้ทั้งหมดของบริษัทนี้ถาวร? ข้อมูลที่บันทึกจะถูกลบและไม่สามารถกู้คืนได้`)) return;
    setError("");
    setMessage("");
    try {
      await apiJson(`/api/admin/tenants/${t.id}`, { method: "DELETE" });
      setMessage(`ลบบริษัท ${label} แล้ว`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบบริษัทไม่สำเร็จ");
    }
  }

  async function approve(userId: string) {
    setError("");
    try {
      await apiJson(`/api/admin/users/${userId}/approve`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    }
  }

  if (!isSuperuser) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">ผู้ดูแลระบบ (Superuser)</h1>
        <p className="text-sm text-gray-500">จัดการแพ็กเกจ ราคา ฟีเจอร์ และบริษัท (tenant) ทั้งหมดในระบบ</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">แพ็กเกจสมาชิก</h2>
          <p className="text-xs text-gray-500">กำหนดชื่อ ราคา และฟีเจอร์ของแต่ละแพ็กเกจ การเปลี่ยนแปลงมีผลกับบริษัทที่ใช้แพ็กเกจนั้นทันที</p>
        </div>
        <CreatePackageForm
          onCreated={(msg) => { setMessage(msg); load(); }}
          onError={setError}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} onSaved={(msg) => { setMessage(msg); load(); }} onError={setError} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">รายการแจ้งชำระเงิน (รอยืนยัน)</h2>
          <p className="text-xs text-gray-500">ตรวจยอดเข้าบัญชี PromptPay แล้วกดยืนยัน ระบบจะต่ออายุสมาชิก 1 เดือนและเปิดใช้งานทันที</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          {payments.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีรายการรอยืนยัน</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 font-medium">บริษัท</th>
                  <th className="py-2 font-medium">แพ็กเกจ</th>
                  <th className="py-2 font-medium">จำนวนเงิน</th>
                  <th className="py-2 font-medium">สลิป</th>
                  <th className="py-2 font-medium">แจ้งเมื่อ</th>
                  <th className="py-2 font-medium">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2">{p.tenant_name}</td>
                    <td className="py-2">{p.package_id}</td>
                    <td className="py-2">{p.amount.toLocaleString("th-TH")}</td>
                    <td className="py-2">
                      {p.slip ? (
                        <button type="button" onClick={() => setSlipPreview(p.slip)} className="block">
                          <img src={p.slip} alt="สลิปการโอน" className="h-12 border border-gray-200 rounded" />
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-2">{new Date(p.created_at).toLocaleString("th-TH")}</td>
                    <td className="py-2 space-x-2">
                      <button onClick={() => confirmPayment(p.id)} className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700">ยืนยัน</button>
                      <button onClick={() => rejectPayment(p.id)} className="px-3 py-1 rounded-md border border-gray-300 text-gray-700 text-xs hover:bg-gray-50">ปฏิเสธ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <form onSubmit={savePromptpay} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">บัญชี PromptPay รับชำระค่าสมาชิก</h2>
          <p className="text-xs text-gray-500">ใช้สร้าง QR code ให้ผู้สมัครสแกนชำระ: เบอร์มือถือ 10 หลัก, เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก หรือ e-Wallet 15 หลัก</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={promptpayId}
            onChange={(e) => setPromptpayId(e.target.value)}
            placeholder="PromptPay ID เช่น 081-234-5678"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            aria-label="PromptPay ID"
          />
          <input
            value={promptpayName}
            onChange={(e) => setPromptpayName(e.target.value)}
            placeholder="ชื่อบัญชีผู้รับเงิน"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            aria-label="ชื่อบัญชี PromptPay"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700">
            บันทึก
          </button>
          {promptpayMsg && <span className="text-sm text-emerald-700">{promptpayMsg}</span>}
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">ทดสอบ QR PromptPay 1 บาท</h2>
          <p className="text-xs text-gray-500">สร้าง QR ยอด 1 บาทจากบัญชี PromptPay ที่บันทึกไว้ เพื่อทดสอบการสแกนจ่ายจริง (ไม่มีการบันทึกข้อมูล)</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testPromptpay}
            disabled={testingQr}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {testingQr ? "กำลังสร้าง QR..." : "ทดสอบ QR 1 บาท"}
          </button>
          {testQr && (
            <button type="button" onClick={() => setTestQr(null)} className="text-sm text-gray-500 hover:underline">
              ซ่อน QR
            </button>
          )}
        </div>
        {testQr && (
          <div className="flex flex-col items-center gap-2">
            <img src={testQr.qrDataUrl} alt="QR PromptPay 1 บาท" className="w-60 h-60 border border-gray-200 rounded" />
            <p className="text-sm text-gray-700">
              ยอด {testQr.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
              {testQr.accountName ? ` · ${testQr.accountName}` : ""}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={saveSuperuserEmail} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">อีเมลผู้ดูแลระบบ (แจ้งสมาชิกใหม่)</h2>
          <p className="text-xs text-gray-500">
            เมื่อสมาชิกส่งสลิปการชำระเงิน ระบบจะส่งอีเมลแจ้งมาที่อีเมลนี้ และส่งอีเมลขอบคุณให้ผู้สมัครโดยอัตโนมัติ
            (ต้องตั้งค่า SMTP ในไฟล์ .env ของเซิร์ฟเวอร์)
          </p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          อีเมลปลายทาง
          <input
            type="email"
            value={superuserEmail}
            onChange={(e) => setSuperuserEmail(e.target.value)}
            placeholder="admin@example.com"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-normal"
          />
        </label>
        <p className="text-xs text-gray-600">
          ปุ่มส่งทดสอบจะส่งไปที่:{" "}
          <span className="font-medium text-purple-700">{superuserEmail.trim() || "ยังไม่ได้กรอกอีเมล"}</span>
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700">
            บันทึก
          </button>
          <button
            type="button"
            onClick={sendTestEmail}
            disabled={testEmailSending}
            className="px-4 py-2 rounded-md border border-purple-600 text-purple-700 text-sm hover:bg-purple-50 disabled:opacity-50"
          >
            {testEmailSending ? "กำลังส่ง..." : "ส่งอีเมลทดสอบ"}
          </button>
          {superuserMsg && <span className="text-sm text-emerald-700">{superuserMsg}</span>}
        </div>
      </form>

      <form onSubmit={saveWebhook} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">AI Assistant Webhook</h2>
          <p className="text-xs text-gray-500">ระบบจะส่งข้อความของผู้ใช้ไปที่ URL นี้ด้วย POST (JSON: message, history, user) และรับคำตอบจากฟิลด์ reply</p>
        </div>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://your-n8n-or-make-url/webhook/..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button type="submit" className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700">
            บันทึก
          </button>
          {webhookMsg && <span className="text-sm text-emerald-700">{webhookMsg}</span>}
        </div>
      </form>

      {slipPreview && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={() => setSlipPreview(null)}
        >
          <img src={slipPreview} alt="สลิปการโอน" className="max-h-full max-w-full bg-white rounded-lg" />
        </div>
      )}

      <LogbookPanel />

      {tenants.map((t) => (
        <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">{t.companyName || t.name}</h2>
              <p className="text-xs text-gray-500">tenant id: {t.id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <TenantPackageSelect
                tenantId={t.id}
                currentPackageId={t.packageId}
                packages={packages}
                onSaved={(msg) => { setMessage(msg); load(); }}
                onError={setError}
              />
              <span>
                สถานะ: {subscriptionLabel(t.subscription)} · กิจกรรมที่บันทึก: {t.activityCount} · สร้างเมื่อ {new Date(t.createdAt).toLocaleString("th-TH")}
              </span>
              <button
                type="button"
                onClick={() => setEditingTenantId(editingTenantId === t.id ? null : t.id)}
                className="px-3 py-1 rounded-md border border-purple-300 text-purple-700 text-xs hover:bg-purple-50"
              >
                {editingTenantId === t.id ? "ปิดการแก้ไข" : "แก้ไข"}
              </button>
              <button
                type="button"
                onClick={() => deleteTenant(t)}
                className="px-3 py-1 rounded-md border border-red-300 text-red-600 text-xs hover:bg-red-50"
              >
                ลบบริษัท
              </button>
            </div>
          </div>

          {editingTenantId === t.id && (
            <TenantEditForm
              tenant={t}
              onSaved={(msg) => { setEditingTenantId(null); setMessage(msg); load(); }}
              onCancel={() => setEditingTenantId(null)}
              onError={setError}
            />
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 font-medium">ชื่อ</th>
                <th className="py-2 font-medium">อีเมล</th>
                <th className="py-2 font-medium">บทบาท</th>
                <th className="py-2 font-medium">สิทธิ์</th>
                <th className="py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {t.users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2">{u.name}</td>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2">{u.role}</td>
                  <td className="py-2">{u.isSuperuser ? "Superuser" : "-"}</td>
                  <td className="py-2">
                    {u.approved ? (
                      <span className="text-emerald-700">อนุมัติแล้ว</span>
                    ) : (
                      <button
                        onClick={() => approve(u.id)}
                        className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                      >
                        อนุมัติ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {t.users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-gray-400">ไม่มีผู้ใช้</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Create a new package (code, name, description, price, features).
function CreatePackageForm({
  onCreated,
  onError,
}: {
  onCreated: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [maxUsers, setMaxUsers] = useState("1");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(key: FeatureKey) {
    setFeatures((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  function reset() {
    setCode("");
    setName("");
    setDescription("");
    setPrice("0");
    setMaxUsers("1");
    setFeatures([]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/admin/packages", {
        method: "POST",
        body: JSON.stringify({ code, name, description, price: Number(price), maxUsers: Number(maxUsers), features }),
      });
      onCreated(`สร้างแพ็กเกจ ${code.trim().toUpperCase()} แล้ว`);
      reset();
      setOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "สร้างแพ็กเกจไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700"
      >
        + สร้างแพ็กเกจ
      </button>
    );
  }

  return (
    <form onSubmit={create} className="bg-white border border-emerald-200 rounded-xl p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">สร้างแพ็กเกจใหม่</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="รหัส เช่น C (A-Z, 0-9)"
          maxLength={20}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          aria-label="รหัสแพ็กเกจ"
        />
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อแพ็กเกจ"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          aria-label="ชื่อแพ็กเกจใหม่"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="คำอธิบาย"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        aria-label="คำอธิบายแพ็กเกจใหม่"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        ราคา (THB)
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-32 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        />
        <span className="text-gray-400">/ เดือน</span>
      </label>
      <MaxUsersField value={maxUsers} onChange={setMaxUsers} />
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">ฟีเจอร์</p>
        {FEATURES.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={features.includes(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "กำลังสร้าง..." : "สร้างแพ็กเกจ"}
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

interface LogEntry {
  id: number;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  tenantName: string | null;
  detail: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  signup: "สมัครใช้งาน",
  approve_user: "อนุมัติผู้ใช้",
  payment_submit: "ส่งสลิปชำระเงิน",
  payment_confirm: "ยืนยันการชำระเงิน",
  payment_reject: "ปฏิเสธการชำระเงิน",
};

// Logbook of signups and approvals. Loads only when the user opens it.
function LogbookPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadLogs() {
    setLoading(true);
    setError("");
    try {
      setLogs(await apiJson<LogEntry[]>("/api/admin/logs"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด logbook ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadLogs();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Logbook</h2>
          <p className="text-xs text-gray-500">บันทึกการสมัครใช้งานและการอนุมัติ</p>
        </div>
        <div className="flex gap-2">
          {open && (
            <button type="button" onClick={loadLogs} disabled={loading} className="px-3 py-1 rounded-md border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
          )}
          <button type="button" onClick={toggle} className="px-3 py-1 rounded-md border border-purple-300 text-purple-700 text-xs hover:bg-purple-50">
            {open ? "ซ่อน" : "ดู Logbook"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 font-medium">เวลา</th>
                  <th className="py-2 font-medium">เหตุการณ์</th>
                  <th className="py-2 font-medium">ผู้ดำเนินการ</th>
                  <th className="py-2 font-medium">อีเมลผู้ใช้</th>
                  <th className="py-2 font-medium">บริษัท</th>
                  <th className="py-2 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString("th-TH")}</td>
                    <td className="py-2">{ACTION_LABELS[l.action] ?? l.action}</td>
                    <td className="py-2">{l.actorEmail ?? "-"}</td>
                    <td className="py-2">{l.targetEmail ?? "-"}</td>
                    <td className="py-2">{l.tenantName ?? "-"}</td>
                    <td className="py-2">{l.detail ?? "-"}</td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-2 text-gray-400">ยังไม่มีบันทึก</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit a tenant's display name and company name.
function TenantEditForm({
  tenant,
  onSaved,
  onCancel,
  onError,
}: {
  tenant: AdminTenant;
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [companyName, setCompanyName] = useState(tenant.companyName);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson(`/api/admin/tenants/${tenant.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, companyName }),
      });
      onSaved("บันทึกข้อมูลบริษัทแล้ว");
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกข้อมูลบริษัทไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-gray-700 space-y-1">
          ชื่อบริษัท (ระบบ)
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            aria-label="ชื่อบริษัทในระบบ"
          />
        </label>
        <label className="text-sm text-gray-700 space-y-1">
          ชื่อบริษัทในรายงาน
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={200}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            aria-label="ชื่อบริษัทในรายงาน"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

// Pick which package a tenant (company) uses.
function TenantPackageSelect({
  tenantId,
  currentPackageId,
  packages,
  onSaved,
  onError,
}: {
  tenantId: string;
  currentPackageId: string | null;
  packages: AdminPackage[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function change(packageId: string) {
    setSaving(true);
    try {
      await apiJson(`/api/admin/tenants/${tenantId}/package`, {
        method: "PUT",
        body: JSON.stringify({ packageId }),
      });
      onSaved("เปลี่ยนแพ็กเกจของบริษัทแล้ว");
    } catch (err) {
      onError(err instanceof Error ? err.message : "เปลี่ยนแพ็กเกจไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-2">
      แพ็กเกจ
      <select
        value={currentPackageId ?? ""}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="border border-gray-300 rounded-md px-2 py-1 text-sm"
        aria-label="แพ็กเกจของบริษัท"
      >
        {currentPackageId === null && <option value="">-- ยังไม่เลือก --</option>}
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} – {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Edit one package's name, description, price and features.
function PackageCard({
  pkg,
  onSaved,
  onError,
}: {
  pkg: AdminPackage;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description);
  const [price, setPrice] = useState(String(pkg.price));
  const [maxUsers, setMaxUsers] = useState(String(pkg.maxUsers));
  const [features, setFeatures] = useState<FeatureKey[]>(pkg.features);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(pkg.name);
    setDescription(pkg.description);
    setPrice(String(pkg.price));
    setMaxUsers(String(pkg.maxUsers));
    setFeatures(pkg.features);
  }, [pkg]);

  function toggle(key: FeatureKey) {
    setFeatures((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  async function save() {
    setSaving(true);
    try {
      await apiJson(`/api/admin/packages/${pkg.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, price: Number(price), maxUsers: Number(maxUsers), features }),
      });
      onSaved(`บันทึกแพ็กเกจ ${pkg.code} แล้ว`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกแพ็กเกจไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">{pkg.code}</span>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-semibold"
        aria-label="ชื่อแพ็กเกจ"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        aria-label="คำอธิบาย"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        ราคา ({pkg.currency})
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-32 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        />
        <span className="text-gray-400">/ เดือน</span>
      </label>
      <MaxUsersField value={maxUsers} onChange={setMaxUsers} />
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500">ฟีเจอร์</p>
        {FEATURES.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={features.includes(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "กำลังบันทึก..." : "บันทึกแพ็กเกจ"}
      </button>
    </div>
  );
}
