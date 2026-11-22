import type { ActivityRecord } from "../types";
import type { EmissionFactor } from "../data/emissionFactors";
import {
  roundUp2,
  roundUpInt,
} from "../context/AppContext";

export interface ScopeTotal {
  scope: "scope1" | "scope2" | "scope3";
  rawTotal: number; // sum of co2e, 2 decimals
  roundedTotal: number; // rounded up to integer (per TGO rule)
  recordCount: number;
}

export interface CalculationResult {
  scope1: ScopeTotal;
  scope2: ScopeTotal;
  scope3: ScopeTotal;
  grandTotalRaw: number;
  grandTotalRounded: number; // scope1 + scope2 + scope3, each rounded up
  co2Tonnes: number; // grandTotalRounded / 1000
  ch4Tonnes: number; // placeholder (not separated)
  n2oTonnes: number; // placeholder
}

// Base-year emissions (tCO2e) derived from the activities entered for the base period.
export function baseYearTotalsT(baseActivities: { co2e: number; scope: string }[]) {
  const sumT = (scope: string) =>
    baseActivities.filter((a) => a.scope === scope).reduce((t, a) => t + a.co2e, 0) / 1000;
  const scope1 = sumT("scope1");
  const scope2 = sumT("scope2");
  const scope3 = sumT("scope3");
  return { total: scope1 + scope2 + scope3, scope1, scope2, scope3, other: 0 };
}

export function calculateTotals(
  activities: ActivityRecord[]
): CalculationResult {
  const scope1 = activities.filter((a) => a.scope === "scope1");
  const scope2 = activities.filter((a) => a.scope === "scope2");
  const scope3 = activities.filter((a) => (a.scope as string) === "scope3");

  const s1Raw = scope1.reduce((sum, a) => sum + a.co2e, 0);
  const s2Raw = scope2.reduce((sum, a) => sum + a.co2e, 0);
  const s3Raw = scope3.reduce((sum, a) => sum + a.co2e, 0);

  // Per TGO meeting resolution (4/2563): FR-04 shows 2 decimals; FR-05 shows
  // whole numbers using Roundup per scope. Total = sum after rounding each scope.
  const s1Rounded = roundUpInt(s1Raw);
  const s2Rounded = roundUpInt(s2Raw);
  const s3Rounded = roundUpInt(s3Raw);

  return {
    scope1: {
      scope: "scope1",
      rawTotal: roundUp2(s1Raw),
      roundedTotal: s1Rounded,
      recordCount: scope1.length,
    },
    scope2: {
      scope: "scope2",
      rawTotal: roundUp2(s2Raw),
      roundedTotal: s2Rounded,
      recordCount: scope2.length,
    },
    scope3: {
      scope: "scope3",
      rawTotal: roundUp2(s3Raw),
      roundedTotal: s3Rounded,
      recordCount: scope3.length,
    },
    grandTotalRaw: roundUp2(s1Raw + s2Raw + s3Raw),
    grandTotalRounded: s1Rounded + s2Rounded + s3Rounded,
    co2Tonnes: (s1Rounded + s2Rounded + s3Rounded) / 1000,
    ch4Tonnes: 0,
    n2oTonnes: 0,
  };
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatInt(n: number): string {
  return Math.ceil(n).toLocaleString(undefined);
}

export function kgToTonnes(kg: number): number {
  return kg / 1000;
}

export function activitiesByFactor(
  activities: ActivityRecord[],
  factors: EmissionFactor[]
) {
  return activities.map((a) => {
    const factor = factors.find((f) => f.id === a.factorId);
    return {
      ...a,
      factorName: factor?.name ?? "Unknown",
      factorUnit: factor?.unit ?? a.unit,
      factorValue: factor?.factor ?? 0,
    };
  });
}
