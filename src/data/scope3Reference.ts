// Scope 3 emission factors (kgCO2e per activity unit).
// Source: public/EF_Scope3_V1.csv (CFP table), generated into scope3CfpTable.ts.
import type { EmissionFactor } from "./emissionFactors";
import { SCOPE3_CFP_TABLE } from "./scope3CfpTable";
import { DEFRA_TRAVEL_ROWS } from "./defraTravelEF";

// The 15 Scope 3 categories defined by the GHG Protocol.
export type Scope3Category =
  | "purchased_goods"
  | "capital_goods"
  | "fuel_energy"
  | "upstream_transport"
  | "waste"
  | "business_travel"
  | "commuting"
  | "upstream_leased"
  | "downstream_transport"
  | "processing_sold"
  | "use_sold"
  | "end_of_life"
  | "downstream_leased"
  | "franchises"
  | "investments";

// Display order: 1-8 upstream, 9-15 downstream.
export const SCOPE3_CATEGORY_ORDER: Scope3Category[] = [
  "purchased_goods",
  "capital_goods",
  "fuel_energy",
  "upstream_transport",
  "waste",
  "business_travel",
  "commuting",
  "upstream_leased",
  "downstream_transport",
  "processing_sold",
  "use_sold",
  "end_of_life",
  "downstream_leased",
  "franchises",
  "investments",
];

export const SCOPE3_CATEGORY_LABELS: Record<Scope3Category, string> = {
  purchased_goods: "1. สินค้าและบริการที่ซื้อ (Purchased goods and services)",
  capital_goods: "2. สินค้าทุน (Capital goods)",
  fuel_energy: "3. กิจกรรมด้านเชื้อเพลิงและพลังงาน ที่ไม่รวมใน Scope 1/2 (Fuel- and energy-related activities)",
  upstream_transport: "4. การขนส่งและกระจายสินค้าขาเข้า (Upstream transportation and distribution)",
  waste: "5. ของเสียที่เกิดจากการดำเนินงาน (Waste generated in operations)",
  business_travel: "6. การเดินทางเพื่อธุรกิจ (Business travel)",
  commuting: "7. การเดินทางของพนักงาน (Employee commuting)",
  upstream_leased: "8. สินทรัพย์เช่าต้นน้ำ (Upstream leased assets)",
  downstream_transport: "9. การขนส่งและกระจายสินค้าขาออก (Downstream transportation and distribution)",
  processing_sold: "10. การแปรรูปผลิตภัณฑ์ที่จำหน่าย (Processing of sold products)",
  use_sold: "11. การใช้งานผลิตภัณฑ์ที่จำหน่าย (Use of sold products)",
  end_of_life: "12. การจัดการผลิตภัณฑ์เมื่อหมดอายุ (End-of-life treatment of sold products)",
  downstream_leased: "13. สินทรัพย์เช่าปลายน้ำ (Downstream leased assets)",
  franchises: "14. แฟรนไชส์ (Franchises)",
  investments: "15. การลงทุน (Investments)",
};

export interface Scope3Factor {
  id: string;
  name: string;
  unit: string;
  factor: number;
  category: Scope3Category;
  source: string;
}

// Rule-based mapping of a CFP item to a Scope 3 category (by item name).
// Items that match no rule are treated as purchased goods/services.
const FUEL_RE = /ไฟฟ้า|Electricity|ดีเซล|Diesel|เบนซิน|แก๊สโซลีน|Gasoline|น้ำมันเตา|Fuel oil|ก๊าด|Kerosene|LPG|หุงต้ม|ก๊าซธรรมชาติ|Natural Gas|ถ่านหิน|Coal|แนฟทา|Naphtha|ถ่านไม|Charcoal|โพรเพน|Propane|อีเทน|Ethane|มีเทน|Methane/i;
const WASTE_RE = /ขยะ|ของเสีย|น้ำเสีย|ฝังกลบ|Waste|landfill|บำบัด/i;
const TRANSPORT_RE = /รถ|เครื่องบิน|เรือ|รถไฟ|ขนส่ง|Truck|Flight|Vehicle|Car\b|Bus\b|Ship|Rail/i;

export function classifyCfpItem(name: string): Scope3Category {
  if (FUEL_RE.test(name)) return "fuel_energy";
  if (WASTE_RE.test(name)) return "waste";
  if (TRANSPORT_RE.test(name)) return "upstream_transport";
  return "purchased_goods";
}

export const SCOPE3_EF: Scope3Factor[] = [
  ...SCOPE3_CFP_TABLE.map(([no, name, unit, factor, reference]) => ({
    id: `CFP-${no}`,
    name,
    unit,
    factor,
    category: classifyCfpItem(name),
    source: `CFP table (EF_Scope3_V1)${reference ? ` – ${reference}` : ""}`,
  })),
  // DEFRA 2026 travel factors for categories 6 (business travel) and 7 (commuting).
  ...DEFRA_TRAVEL_ROWS.flatMap((r) =>
    r.roles.map((role) => ({
      id: `DEFRA-${r.key}-${role === "business_travel" ? "B" : "C"}`,
      name: r.name,
      unit: r.unit,
      factor: r.factor,
      category: role,
      source: "DEFRA 2026 (UK) – ตรวจกับไฟล์ทางการก่อนใช้รายงานจริง",
    }))
  ),
];

// Resolve the Scope 3 category of a saved activity.
// Purchase entries are always purchased goods. Otherwise the factor decides the category;
// older records saved under the previous scheme are mapped via their subCategory.
export function scope3CategoryOf(
  a: { entryType?: string; factorId?: string; subCategory?: string },
  factors: Scope3Factor[] = SCOPE3_EF
): Scope3Category {
  if (a.entryType === "purchase") return "purchased_goods";
  // Categories that share a factor list (e.g. 9 uses the transport EFs of 4) keep the saved category.
  if ((SCOPE3_CATEGORY_ORDER as string[]).includes(a.subCategory || "")) return a.subCategory as Scope3Category;
  const f = factors.find((x) => x.id === a.factorId);
  if (f) return f.category;
  if (a.subCategory === "water") return "purchased_goods";
  if ((SCOPE3_CATEGORY_ORDER as string[]).includes(a.subCategory || "")) return a.subCategory as Scope3Category;
  return "purchased_goods";
}

// Transport categories offer both transport EFs and fuel EFs (electricity excluded).
// Category 9 (downstream transport) uses the same list as category 4.
const TRANSPORT_EF_SOURCES: Scope3Category[] = ["upstream_transport", "fuel_energy"];
const ELECTRICITY_RE = /ไฟฟ้า|Electricity/i;

export function scope3FactorsFor(category: Scope3Category, factors: Scope3Factor[]): Scope3Factor[] {
  if (category === "upstream_transport" || category === "downstream_transport") {
    return factors.filter(
      (f) => TRANSPORT_EF_SOURCES.includes(f.category) && !(f.category === "fuel_energy" && ELECTRICITY_RE.test(f.name))
    );
  }
  return factors.filter((f) => f.category === category);
}

// Shape used by the shared factor lists (Dashboard names, EF table)
export const SCOPE3_AS_EMISSION_FACTORS: EmissionFactor[] = SCOPE3_EF.map((f) => ({
  id: f.id,
  name: `${f.id} - ${f.name}`,
  unit: f.unit,
  factor: f.factor,
  category: f.category,
  source: f.source,
}));
