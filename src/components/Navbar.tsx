import { Menu, User, Bell, HelpCircle, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { session, logout } = useAuth();

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 z-40">
      <div className="flex items-center gap-4">
        <button
          className="md:hidden p-2 text-gray-500 hover:text-gray-900"
          onClick={() => {}}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden md:flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            ระบบพร้อมใช้งาน
          </span>
          {session && (
            <span className="ml-3 text-sm font-medium text-gray-700">{session.tenant.name}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="p-2 text-gray-500 hover:text-gray-900 relative"
          title="ความช่วยเหลือ"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <button
          className="p-2 text-gray-500 hover:text-gray-900 relative"
          title="การแจ้งเตือน"
        >
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium text-gray-900">{session?.user.name || "ผู้ใช้ระบบ"}</span>
            <span className="text-xs text-gray-500">{session?.user.email}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </div>
          <button
            className="p-2 text-gray-500 hover:text-red-600"
            title="ออกจากระบบ"
            onClick={() => logout()}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
