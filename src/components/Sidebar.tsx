import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Factory,
  Zap,
  Save,
  Table2,
  ShieldCheck,
  Truck,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Layers,
  ClipboardList,
  ClipboardCheck,
  ClipboardCheck as QualityIcon,
  Gauge,
  Target,
  CreditCard,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

import type { FeatureKey } from "../utils/packages";

interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: LucideIcon;
  feature?: FeatureKey; // hidden when the tenant's package doesn't include it
}

const navItems: NavItem[] = [
  { path: "/", label: "หน้าแรก", short: "หน้าหลัก", icon: LayoutDashboard },
  { path: "/company", label: "ข้อมูลบริษัท", short: "บริษัท", icon: Building2 },
  { path: "/billing", label: "ค่าสมาชิก", short: "สมาชิก", icon: CreditCard },
  { path: "/scope1", label: "ขอบเขตที่ 1 (Scope 1)", short: "S1", icon: Factory, feature: "scope1" },
  { path: "/scope2", label: "ขอบเขตที่ 2 (Scope 2)", short: "S2", icon: Zap, feature: "scope2" },
  { path: "/scope3", label: "ขอบเขตที่ 3 (Scope 3)", short: "S3", icon: Truck, feature: "scope3" },
  { path: "/scope3-significance", label: "ประเมินนัยสำคัญ S3 (Fr-03.2)", short: "FR-03.2", icon: ClipboardCheck, feature: "scope3" },
  { path: "/scope3-criteria", label: "เกณฑ์คะแนน S3 (ตาราง G)", short: "ตาราง G", icon: Table2, feature: "scope3" },
  { path: "/uncertainty", label: "ประเมินความไม่แน่นอน (Uncertainty)", short: "Uncertainty", icon: Gauge, feature: "scope3" },
  { path: "/quality", label: "การจัดการคุณภาพข้อมูล", short: "คุณภาพ", icon: QualityIcon },
  { path: "/emission-factors", label: "ตาราง EF (Scope 1/2)", short: "EF", icon: Table2, feature: "scope1" },
  { path: "/scope1-items", label: "รายการ Scope 1 (Reference)", short: "S1 List", icon: ListChecks, feature: "scope1" },
  { path: "/ef-components", label: "EF Components", short: "EF Comp", icon: Layers, feature: "scope1" },
  { path: "/scope3-list", label: "ตาราง CFP", short: "CFP", icon: ClipboardList, feature: "scope3" },
  { path: "/net-zero", label: "Net Zero Pathway", short: "Net Zero", icon: Target },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { session, hasFeature } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const visibleNavItems = navItems.filter((item) => !item.feature || hasFeature(item.feature));
  const teamItems: NavItem[] = session?.user.isTenantAdmin
    ? [{ path: "/team", label: "ผู้ใช้งานในบริษัท", short: "Users", icon: Users }]
    : [];
  const allNavItems = [
    ...visibleNavItems.slice(0, 3),
    ...teamItems,
    ...visibleNavItems.slice(3),
    ...(session?.user.isSuperuser
      ? [{ path: "/admin", label: "ผู้ดูแลระบบ", short: "Admin", icon: ShieldCheck }]
      : []),
  ];

  return (
    <aside
      className={`relative flex h-screen shrink-0 flex-col bg-white border-r border-gray-200 z-50 transition-[width] duration-300 ${collapsed ? "w-20" : "w-64"}`}
    >
      <div className="flex items-center h-14 px-3 border-b border-gray-200 bg-white">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mr-2 p-1.5 text-gray-500 hover:text-gray-900"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
        {!collapsed && (
          <h1 className="font-bold text-emerald-700 text-sm tracking-tight">
            CFO<span className="text-gray-500">-flow</span>
          </h1>
        )}
        {!collapsed && session?.tenant.package && (
          <span className="ml-auto text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
            {session.tenant.package.code}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1">
        {allNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = window.location.pathname === item.path;
          return (
            <button
              key={item.path}
              title={collapsed ? item.label : undefined}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-r-4 border-emerald-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <span className="flex flex-col items-center gap-0.5"><Icon className="w-5 h-5" />{collapsed && <span className="text-[9px] leading-none font-semibold">{item.short}</span>}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {hasFeature("verification") && <div className="p-4 border-t border-gray-200">
        <button
          onClick={() => navigate("/export")}
          title={collapsed ? "ส่งออกรายงาน" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors ${collapsed ? "justify-center px-1" : ""}`}
        >
          <span className="flex flex-col items-center gap-0.5"><Save className="w-4 h-4" />{collapsed && <span className="text-[9px] leading-none font-semibold">ส่งออก</span>}</span>
          <span className={collapsed ? "hidden" : "block"}>สร้าง Verification Sheet / ส่งออก</span>
        </button>
      </div>}
    </aside>
  );
}
