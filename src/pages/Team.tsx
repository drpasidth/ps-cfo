import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../api";
import { useAuth, type Action, type Permissions, type Resource } from "../context/AuthContext";

const RESOURCES: { key: Resource; label: string }[] = [
  { key: "activities", label: "ข้อมูลกิจกรรม (Scope 1-3)" },
  { key: "company", label: "ข้อมูลบริษัท" },
  { key: "settings", label: "การตั้งค่า (EF, ตาราง, ค่าความไม่แน่นอน)" },
];
const ACTIONS: { key: Action; label: string }[] = [
  { key: "create", label: "เพิ่ม" },
  { key: "read", label: "ดู" },
  { key: "update", label: "แก้ไข" },
  { key: "delete", label: "ลบ" },
];

// New members can read everything; the admin grants the rest.
const DEFAULT_PERMISSIONS: Permissions = {
  activities: { create: false, read: true, update: false, delete: false },
  company: { create: false, read: true, update: false, delete: false },
  settings: { create: false, read: true, update: false, delete: false },
};

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  isTenantAdmin: boolean;
  permissions: Permissions;
}

interface TeamResponse {
  maxUsers: number;
  used: number;
  members: Member[];
}

function PermissionGrid({
  value,
  onChange,
  disabled,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}) {
  function toggle(resource: Resource, action: Action) {
    onChange({ ...value, [resource]: { ...value[resource], [action]: !value[resource][action] } });
  }
  return (
    <table className="text-sm">
      <thead>
        <tr className="text-xs text-gray-500">
          <th className="text-left font-medium pr-4 pb-1">ข้อมูล</th>
          {ACTIONS.map((a) => (
            <th key={a.key} className="font-medium px-2 pb-1">{a.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {RESOURCES.map((r) => (
          <tr key={r.key}>
            <td className="pr-4 py-1 text-gray-700">{r.label}</td>
            {ACTIONS.map((a) => (
              <td key={a.key} className="text-center px-2 py-1">
                <input
                  type="checkbox"
                  checked={value[r.key][a.key]}
                  disabled={disabled}
                  onChange={() => toggle(r.key, a.key)}
                  aria-label={`${r.label} ${a.label}`}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MemberCard({
  member,
  onChanged,
  onError,
}: {
  member: Member;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [permissions, setPermissions] = useState<Permissions>(member.permissions);
  const [saving, setSaving] = useState(false);

  useEffect(() => setPermissions(member.permissions), [member]);

  async function save() {
    setSaving(true);
    try {
      await apiJson(`/api/team/${member.id}`, { method: "PUT", body: JSON.stringify({ permissions }) });
      onChanged(`บันทึกสิทธิ์ของ ${member.email} แล้ว`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`ลบผู้ใช้งาน ${member.email} ออกจากบริษัท?`)) return;
    try {
      await apiJson(`/api/team/${member.id}`, { method: "DELETE" });
      onChanged(`ลบ ${member.email} แล้ว`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ลบผู้ใช้งานไม่สำเร็จ");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{member.name}</p>
          <p className="text-xs text-gray-500">{member.email}</p>
        </div>
        {member.isTenantAdmin ? (
          <span className="text-xs font-bold text-purple-700 bg-purple-50 rounded px-2 py-0.5">Tenant Admin</span>
        ) : (
          <button onClick={remove} className="text-sm text-red-600 hover:underline">ลบผู้ใช้</button>
        )}
      </div>
      {member.isTenantAdmin ? (
        <p className="text-xs text-gray-500">ผู้ดูแลบริษัทมีสิทธิ์ทุกอย่าง และจัดการผู้ใช้งานได้</p>
      ) : (
        <>
          <PermissionGrid value={permissions} onChange={setPermissions} />
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
          </button>
        </>
      )}
    </div>
  );
}

export default function Team() {
  const { session } = useAuth();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [adding, setAdding] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  async function downloadBackup() {
    setError("");
    setMessage("");
    setBackingUp(true);
    try {
      const response = await apiFetch("/api/tenant/backup");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || response.statusText);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = (session?.tenant.name ?? "company").replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim() || "company";
      link.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สำรองข้อมูลไม่สำเร็จ");
    } finally {
      setBackingUp(false);
    }
  }

  async function load() {
    try {
      setTeam(await apiJson<TeamResponse>("/api/team"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดผู้ใช้งานไม่สำเร็จ");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function changed(msg: string) {
    setError("");
    setMessage(msg);
    load();
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setAdding(true);
    try {
      await apiJson("/api/team", {
        method: "POST",
        body: JSON.stringify({ name, email, password, permissions }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setPermissions(DEFAULT_PERMISSIONS);
      changed(`เพิ่มผู้ใช้งาน ${email.trim()} แล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มผู้ใช้งานไม่สำเร็จ");
    } finally {
      setAdding(false);
    }
  }

  if (!session?.user.isTenantAdmin) {
    return <p className="text-gray-500">หน้านี้สำหรับผู้ดูแลบริษัท (Tenant Admin) เท่านั้น</p>;
  }

  const full = team ? team.used >= team.maxUsers : false;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ผู้ใช้งานในบริษัท</h1>
        <p className="text-sm text-gray-500">
          {team ? `ใช้แล้ว ${team.used} จาก ${team.maxUsers} คน (ตามแพ็กเกจ ${session.tenant.package?.code ?? "-"})` : "กำลังโหลด..."}
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 text-red-700 text-sm px-4 py-2">{error}</div>}
      {message && <div className="rounded-md bg-emerald-50 text-emerald-700 text-sm px-4 py-2">{message}</div>}

      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">สำรองข้อมูลบริษัท</h2>
          <p className="text-sm text-gray-500">ดาวน์โหลดไฟล์ฐานข้อมูลทั้งหมดของบริษัทนี้ (กิจกรรม ข้อมูลบริษัท และการตั้งค่า)</p>
        </div>
        <button
          onClick={downloadBackup}
          disabled={backingUp}
          className="shrink-0 px-4 py-2 rounded-md bg-gray-800 text-white text-sm hover:bg-gray-900 disabled:opacity-60"
        >
          {backingUp ? "กำลังสำรองข้อมูล..." : "ดาวน์โหลดไฟล์สำรอง"}
        </button>
      </div>

      <form onSubmit={addMember} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">เพิ่มผู้ใช้งาน</h2>
        {full && (
          <p className="text-sm text-amber-700">ถึงจำนวนผู้ใช้งานสูงสุดของแพ็กเกจแล้ว กรุณาอัปเกรดแพ็กเกจเพื่อเพิ่มผู้ใช้</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อ-นามสกุล"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมล"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว)"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs font-medium text-gray-500">สิทธิ์การใช้งาน</p>
        <PermissionGrid value={permissions} onChange={setPermissions} />
        <button
          type="submit"
          disabled={adding || full}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {adding ? "กำลังเพิ่ม..." : "เพิ่มผู้ใช้งาน"}
        </button>
      </form>

      <div className="space-y-4">
        {team?.members.map((m) => (
          <MemberCard key={m.id} member={m} onChanged={changed} onError={setError} />
        ))}
      </div>
    </div>
  );
}
