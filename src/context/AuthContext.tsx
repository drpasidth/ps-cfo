import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, apiJson, getToken, setToken } from "../api";
import { loadTenantStorage } from "../data/tenantStorage";
import { hasFeature as packageHasFeature, type FeatureKey, type PackageInfo } from "../utils/packages";

export type Resource = "activities" | "company" | "settings";
export type Action = "create" | "read" | "update" | "delete";
export type Permissions = Record<Resource, Record<Action, boolean>>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isTenantAdmin: boolean;
  isSuperuser: boolean;
  approved: boolean;
  permissions: Permissions;
}

// Accounts that are not approved yet, or whose subscription has ended, may only use the package/payment page.
export function needsPayment(s: AuthSession): boolean {
  return !s.user.approved || (s.tenant.subscription?.status === "expired" && !s.user.isSuperuser);
}

export interface Subscription {
  status: "trial" | "active" | "expired";
  trialEndsAt: string | null;
  paidUntil: string | null;
}

export interface AuthTenant {
  id: string;
  name: string;
  package: PackageInfo | null;
  subscription?: Subscription;
}

export interface AuthSession {
  user: AuthUser;
  tenant: AuthTenant;
}

export interface SignupInput {
  companyName: string;
  taxId: string;
  address: string;
  contactPhone: string;
  contactPerson: string;
  email: string;
  password: string;
}

type AuthStatus = "loading" | "authed" | "anon";

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  hasFeature: (feature: FeatureKey) => boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(getToken() ? "loading" : "anon");
  const [session, setSession] = useState<AuthSession | null>(null);

  // Restore the session from a stored token on page load.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    apiJson<AuthSession>("/api/auth/me")
      .then(async (s) => {
        if (!needsPayment(s)) await loadTenantStorage();
        if (cancelled) return;
        setSession(s);
        setStatus("authed");
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setSession(null);
        setStatus("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback(async (res: AuthSession & { token: string }) => {
    setToken(res.token);
    // Load this company's own data before any protected page renders (not needed while paying).
    const session = { user: res.user, tenant: res.tenant };
    if (!needsPayment(session)) await loadTenantStorage();
    setSession(session);
    setStatus("authed");
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiJson<AuthSession & { token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await applyAuth(res);
  }, [applyAuth]);

  // Signup logs the new company in; it then goes to the package / payment page until approved.
  const signup = useCallback(async (input: SignupInput) => {
    const res = await apiJson<AuthSession & { token: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await applyAuth(res);
  }, [applyAuth]);

  const hasFeature = useCallback(
    (feature: FeatureKey) => packageHasFeature(session?.tenant.package, feature),
    [session],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors – the local session is cleared regardless
    }
    setToken(null);
    setSession(null);
    setStatus("anon");
    // Reload so no in-memory data from this company remains for the next login.
    window.location.assign("/welcome");
  }, []);

  return (
    <AuthContext.Provider value={{ status, session, hasFeature, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
