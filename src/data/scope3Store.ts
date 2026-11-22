// Editable CFP table for Scope 3. Starts from the built-in EF_Scope3_V1 table and can be
// replaced by an uploaded CSV or edited row by row. Stored per company via tenantStorage (server database).
import { useSyncExternalStore } from "react";
import { SCOPE3_EF, type Scope3Factor } from "./scope3Reference";
import { tenantStorage } from "./tenantStorage";

const KEY = "cfo_saas_scope3_cfp";
const listeners = new Set<() => void>();
let cache: Scope3Factor[] | null = null;

function load(): Scope3Factor[] {
  try {
    const raw = tenantStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Scope3Factor[];
    }
  } catch {
    /* ignore invalid saved data and fall back to the built-in table */
  }
  return SCOPE3_EF;
}

export function getScope3Factors(): Scope3Factor[] {
  if (!cache) cache = load();
  return cache;
}

function notify() {
  listeners.forEach((l) => l());
}

export function setScope3Factors(next: Scope3Factor[]) {
  cache = next;
  tenantStorage.setItem(KEY, JSON.stringify(next));
  notify();
}

export function resetScope3Factors() {
  tenantStorage.removeItem(KEY);
  cache = SCOPE3_EF;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScope3Factors(): Scope3Factor[] {
  return useSyncExternalStore(subscribe, getScope3Factors, getScope3Factors);
}
