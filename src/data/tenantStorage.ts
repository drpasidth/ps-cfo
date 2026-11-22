// Tenant-scoped key/value storage. Same synchronous API as localStorage (getItem / setItem /
// removeItem), but the data lives in the logged-in company's own database on the server
// (table tenant_kv). The values are loaded once after login (see AuthContext), so reads are
// synchronous from memory; writes are sent to the server immediately.
import { apiFetch, apiJson } from "../api";

const cache = new Map<string, string>();

// Called after login / session restore, before any tenant page renders.
export async function loadTenantStorage(): Promise<void> {
  const data = await apiJson<Record<string, string>>("/api/kv");
  cache.clear();
  for (const [key, value] of Object.entries(data)) cache.set(key, value);
}

async function send(path: string, init: RequestInit): Promise<void> {
  try {
    const res = await apiFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    console.error("Could not save tenant data:", error);
  }
}

export const tenantStorage = {
  getItem(key: string): string | null {
    return cache.has(key) ? (cache.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    cache.set(key, value);
    void send(`/api/kv/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) });
  },
  removeItem(key: string): void {
    cache.delete(key);
    void send(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
  },
};
