// Membership package features. The server returns each tenant's package in the session;
// the UI uses these helpers to show or hide features and to filter data for exports.
import type { ActivityRecord } from "../types";

export const FEATURES = [
  { key: "scope1", label: "Scope 1" },
  { key: "scope2", label: "Scope 2" },
  { key: "scope3", label: "Scope 3" },
  { key: "verification", label: "Verification Sheet" },
  { key: "report_word", label: "รายงาน Word (.docx)" },
  { key: "ai", label: "AI Assistant" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export interface PackageInfo {
  id: string;
  code: string;
  name: string;
  features: FeatureKey[];
  maxUsers?: number; // users allowed in the company, including the tenant admin
}

export function hasFeature(pkg: PackageInfo | null | undefined, feature: FeatureKey): boolean {
  return !!pkg && pkg.features.includes(feature);
}

// Keeps only the activities whose scope the package includes.
export function filterActivitiesByPackage(
  activities: ActivityRecord[],
  pkg: PackageInfo | null | undefined,
): ActivityRecord[] {
  return activities.filter((a) => {
    if (a.scope === "scope1") return hasFeature(pkg, "scope1");
    if (a.scope === "scope2") return hasFeature(pkg, "scope2");
    if (a.scope === "scope3") return hasFeature(pkg, "scope3");
    return false;
  });
}
