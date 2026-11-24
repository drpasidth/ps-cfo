import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";
import { useAuth } from "../context/AuthContext";

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

const PAYMENT_LABEL: Record<BillingPayment["status"], string> = {
  pending: "รอการอนุมัติ",
  confirmed: "อนุมัติแล้ว",
  rejected: "ไม่ผ่านการตรวจสอบ",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// Subscription status and payment history. Renewals and package changes happen on the package page.
export default function Billing() {
  const { session } = useAuth();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<BillingInfo>("/api/billing/info")
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลค่าสมาชิกไม่สำเร็จ"));
  }, []);

  const sub = info?.subscription ?? session?.tenant.subscription;
  let statusText = "";
  if (sub?.status === "active" && sub.paidUntil) statusText = `ใช้งานได้ถึง ${formatDate(sub.paidUntil)}`;
  else if (sub?.status === "trial" && sub.trialEndsAt) statusText = `กำลังทดลองใช้ ถึง ${formatDate(sub.trialEndsAt)}`;
  else statusText = "หมดอายุการใช้งาน กรุณาต่ออายุสมาชิก";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">ค่าสมาชิก</h1>
        <p className="text-sm text-gray-600">{statusText}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">แพ็กเกจของบริษัท</h2>
        {info?.package ? (
          <p className="text-sm text-gray-700">
            {info.package.code} – {info.package.name}: <span className="font-semibold">{info.package.price.toLocaleString("th-TH")} {info.package.currency}</span> / ปี
          </p>
        ) : (
          <p className="text-sm text-gray-500">ยังไม่ได้เลือกแพ็กเกจ</p>
        )}
        <Link to="/package" className="inline-block px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700">
          ต่ออายุ / เปลี่ยนแพ็กเกจ
        </Link>
      </section>

      {info && info.payments.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-2">ประวัติการชำระเงิน</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 font-medium">วันที่แจ้ง</th>
                <th className="py-2 font-medium">จำนวนเงิน</th>
                <th className="py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {info.payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2">{formatDate(p.created_at)}</td>
                  <td className="py-2">{p.amount.toLocaleString("th-TH")}</td>
                  <td className="py-2">{PAYMENT_LABEL[p.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
