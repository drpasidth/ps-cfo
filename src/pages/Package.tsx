import { useEffect, useState } from "react";
import { apiJson } from "../api";
import { useAuth } from "../context/AuthContext";
import Copyright from "../components/Copyright";
import { FEATURES, type FeatureKey } from "../utils/packages";

interface PackageOption {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  features: FeatureKey[];
}

interface BillingPayment {
  id: string;
  package_id: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  confirmed_at: string | null;
}

interface BillingInfo {
  approved: boolean;
  subscription: { status: "trial" | "active" | "expired"; trialEndsAt: string | null; paidUntil: string | null };
  package: { code: string; name: string; price: number; currency: string } | null;
  payments: BillingPayment[];
}

interface QrInfo {
  package: PackageOption;
  promptpay: { accountName: string; configured: boolean; qrDataUrl: string | null };
}

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const PAYMENT_LABEL: Record<BillingPayment["status"], string> = {
  pending: "รอการอนุมัติ",
  confirmed: "อนุมัติแล้ว",
  rejected: "ไม่ผ่านการตรวจสอบ",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function featureLabels(keys: FeatureKey[]) {
  return keys.map((k) => FEATURES.find((f) => f.key === k)?.label ?? k).join(", ");
}

// Package selection, PromptPay QR payment and slip upload. Shown to accounts that are waiting for
// approval and to companies whose subscription has ended. The server only lets these users reach billing.
export default function Package({ standalone = false }: { standalone?: boolean }) {
  const { session, logout } = useAuth();
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qr, setQr] = useState<QrInfo | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiJson<PackageOption[]>("/api/billing/packages")
      .then(setPackages)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดแพ็กเกจไม่สำเร็จ"));
    apiJson<BillingInfo>("/api/billing/info")
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลการชำระเงินไม่สำเร็จ"));
  }, []);

  const hasPending = !!info?.payments.some((p) => p.status === "pending");
  const selected = packages.find((p) => p.id === selectedId) ?? null;

  // Load the QR code for the chosen package.
  useEffect(() => {
    setQr(null);
    setSlip(null);
    if (!selected || !(selected.price > 0)) return;
    apiJson<QrInfo>(`/api/billing/qr?packageId=${encodeURIComponent(selected.id)}`)
      .then(setQr)
      .catch((err) => setError(err instanceof Error ? err.message : "สร้าง QR ไม่สำเร็จ"));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("กรุณาแนบสลิปเป็นไฟล์รูปภาพ (PNG, JPG หรือ WEBP)");
      return;
    }
    if (file.size > MAX_SLIP_BYTES) {
      setError("ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSlip(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submitSlip() {
    if (!selected || !slip) return;
    setError("");
    setMessage("");
    setSending(true);
    try {
      await apiJson("/api/billing/payments", {
        method: "POST",
        body: JSON.stringify({ packageId: selected.id, slip }),
      });
      setMessage("ส่งสลิปเรียบร้อยแล้ว ผู้ดูแลระบบจะตรวจสอบและอนุมัติให้เร็ว ๆ นี้");
      setSelectedId(null);
      setInfo(await apiJson<BillingInfo>("/api/billing/info"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งสลิปไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  const expired = info?.subscription.status === "expired";
  const awaitingTrial = !!info && !info.approved && !info.subscription.trialEndsAt && info.payments.length === 0;
  const heading = awaitingTrial
    ? "รอการอนุมัติ: ใบสมัครใช้งานฟรีของคุณอยู่ระหว่างการตรวจสอบ"
    : info && !info.approved
      ? "รอการอนุมัติ: เลือกแพ็กเกจและชำระค่าสมาชิก"
      : "หมดอายุการใช้งาน: กรุณาต่ออายุสมาชิก";

  const content = (
    <div className="space-y-6 max-w-3xl w-full">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{heading}</h1>
        <p className="text-sm text-gray-600">
          บริษัท {session?.tenant.name}
          {expired && info?.subscription.paidUntil ? ` · ใช้งานได้ถึง ${formatDate(info.subscription.paidUntil)}` : ""}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {hasPending ? (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
          ได้รับสลิปของคุณแล้ว กำลังรอผู้ดูแลระบบตรวจสอบและอนุมัติ เมื่ออนุมัติแล้วให้กดปุ่ม "รีเฟรชสถานะ" เพื่อเข้าใช้งาน
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold text-gray-900">1. เลือกแพ็กเกจ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`text-left bg-white border rounded-xl p-5 space-y-2 hover:border-emerald-400 ${
                    selectedId === p.id ? "border-emerald-600 ring-2 ring-emerald-200" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded px-2 py-0.5">{p.code}</span>
                    <span className="font-semibold text-gray-900">
                      {p.price.toLocaleString("th-TH")} {p.currency} / เดือน
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                  <p className="text-xs text-gray-500">ฟีเจอร์: {featureLabels(p.features) || "-"}</p>
                </button>
              ))}
              {packages.length === 0 && <p className="text-sm text-gray-500">ยังไม่มีแพ็กเกจ กรุณาติดต่อผู้ดูแลระบบ</p>}
            </div>
          </section>

          {selected && selected.price > 0 && (
            <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">2. ชำระเงินด้วย PromptPay</h2>
              {qr?.promptpay.qrDataUrl ? (
                <div className="flex flex-col sm:flex-row gap-5 items-center">
                  <img src={qr.promptpay.qrDataUrl} alt="PromptPay QR" className="w-60 h-60 border border-gray-200 rounded-lg" />
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>แพ็กเกจ: <span className="font-medium">{selected.code} – {selected.name}</span></p>
                    <p>จำนวนเงิน: <span className="font-semibold">{selected.price.toLocaleString("th-TH")} {selected.currency}</span></p>
                    {qr.promptpay.accountName && <p>ชื่อบัญชี: <span className="font-medium">{qr.promptpay.accountName}</span></p>}
                    <p className="text-xs text-gray-500">สแกน QR ด้วยแอปธนาคารเพื่อโอนเงินตามจำนวนข้างต้น</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">ยังไม่ได้ตั้งค่าบัญชี PromptPay กรุณาติดต่อผู้ดูแลระบบ</p>
              )}

              <div className="space-y-2">
                <h2 className="font-semibold text-gray-900">3. แนบสลิปการโอน</h2>
                <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 hover:border-purple-400 cursor-pointer">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onSlipChange} className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-gray-300 file:bg-white file:text-gray-700 hover:file:bg-gray-100" />
                  <p className="mt-2 text-xs text-gray-500">รองรับไฟล์ PNG, JPEG, WEBP</p>
                </label>
                {slip && (
                  <img src={slip} alt="สลิปการโอน" className="max-h-64 border border-gray-200 rounded-lg" />
                )}
                <div>
                  <button
                    type="button"
                    onClick={submitSlip}
                    disabled={!slip || sending || !qr?.promptpay.configured}
                    className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {sending ? "กำลังส่ง..." : "ส่งสลิปเพื่อรออนุมัติ"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {info && info.payments.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-2">ประวัติการแจ้งชำระเงิน</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 font-medium">วันที่แจ้ง</th>
                <th className="py-2 font-medium">แพ็กเกจ</th>
                <th className="py-2 font-medium">จำนวนเงิน</th>
                <th className="py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {info.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2">{formatDate(p.created_at)}</td>
                  <td className="py-2">{p.package_id}</td>
                  <td className="py-2">{p.amount.toLocaleString("th-TH")}</td>
                  <td className="py-2">{PAYMENT_LABEL[p.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          รีเฟรชสถานะ
        </button>
        {standalone && (
          <button
            onClick={logout}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            ออกจากระบบ
          </button>
        )}
      </div>
    </div>
  );

  if (!standalone) return content;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex justify-center p-6 md:p-10">{content}</div>
      <Copyright />
    </div>
  );
}
