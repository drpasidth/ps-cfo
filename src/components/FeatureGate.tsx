import { Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { FEATURES, type FeatureKey } from "../utils/packages";

// Shows the page only when the tenant's package includes the feature.
export default function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { hasFeature, session } = useAuth();
  if (hasFeature(feature)) return <>{children}</>;
  const label = FEATURES.find((f) => f.key === feature)?.label ?? feature;
  return (
    <div className="max-w-xl mx-auto mt-16 text-center bg-white border border-gray-200 rounded-xl p-8">
      <Lock className="w-10 h-10 mx-auto text-gray-400" />
      <h1 className="mt-4 text-xl font-semibold text-gray-900">ฟีเจอร์นี้ไม่รวมอยู่ในแพ็กเกจของคุณ</h1>
      <p className="mt-2 text-sm text-gray-600">
        ฟีเจอร์ "{label}" ไม่อยู่ในแพ็กเกจปัจจุบัน{session?.tenant.package ? ` (${session.tenant.package.name})` : ""}
        {" "}กรุณาติดต่อผู้ดูแลระบบเพื่ออัปเกรดแพ็กเกจ
      </p>
    </div>
  );
}
