import { tenantStorage } from "./tenantStorage";

// Scope 1 reference data (mirrors public/Scope1_Items_and_EF.xlsx).
// Total per unit (kgCO2e) = CO2 + CH4*GWP_CH4 + N2O*GWP_N2O + HFC*GWP_HFC + PFC*GWP_PFC + SF6*GWP_SF6

export type Scope1Item = {
  no: number;
  category: string;
  nameTh: string;
  nameEn: string;
  unit: string;
  efId: string;
};

export type Scope1EF = {
  id: string;
  name: string;
  unit: string;
  co2: number;
  ch4: number;
  n2o: number;
  hfc: number;
  pfc: number;
  sf6: number;
  hfcGwp: number;
  pfcGwp: number;
  sf6Gwp: number;
  ch4Gwp: number;
  n2oGwp: number;
  source: string;
};

export const CH4_GWP = 28;
export const N2O_GWP = 265;

// GWP100 set (IPCC AR5). Editable in the app; totals use these values.
export type GwpSet = {
  co2: number;
  fossilCh4: number;
  ch4: number;
  n2o: number;
  sf6: number;
  nf3: number;
};

export const DEFAULT_GWP: GwpSet = {
  co2: 1,
  fossilCh4: 30,
  ch4: 28,
  n2o: 265,
  sf6: 23500,
  nf3: 16100,
};

export const GWP_STORAGE_KEY = "scope1.gwp100";
export const EF_STORAGE_KEY = "scope1.efRows";

// Category tab a given EF_ID belongs to in the Scope 1 page.
export type Scope1Tab = "stationary" | "mobile" | "fugitive";
export function tabForEfId(id: string): Scope1Tab {
  if (id.startsWith("MB-")) return "mobile";
  if (id.startsWith("RF-") || id.startsWith("FS-")) return "fugitive";
  return "stationary";
}

export type Scope1EfOption = {
  id: string;
  name: string;
  unit: string;
  factor: number; // total kgCO2e per unit (with current GWP100)
  category: Scope1Tab;
};

// Raw EF rows (saved edits if any) and the GWP100 set, for writing into the verification sheet.
export function getScope1EfData(): { rows: Scope1EF[]; gwp: GwpSet } {
  let rows: Scope1EF[] = SCOPE1_EF;
  let gwp: GwpSet = DEFAULT_GWP;
  try {
    const savedRows = tenantStorage.getItem(EF_STORAGE_KEY);
    if (savedRows) {
      const parsed = JSON.parse(savedRows) as Scope1EF[];
      if (Array.isArray(parsed) && parsed.length === SCOPE1_EF.length) rows = parsed;
    }
    const savedGwp = tenantStorage.getItem(GWP_STORAGE_KEY);
    if (savedGwp) gwp = { ...DEFAULT_GWP, ...JSON.parse(savedGwp) };
  } catch {
    /* ignore corrupt storage */
  }
  return { rows, gwp };
}

// Current EF Components (saved edits if any, otherwise defaults) turned into dropdown options.
export function getScope1EfOptions(): Scope1EfOption[] {
  let rows: Scope1EF[] = SCOPE1_EF;
  let gwp: GwpSet = DEFAULT_GWP;
  try {
    const savedRows = tenantStorage.getItem(EF_STORAGE_KEY);
    if (savedRows) {
      const parsed = JSON.parse(savedRows) as Scope1EF[];
      if (Array.isArray(parsed) && parsed.length === SCOPE1_EF.length) rows = parsed;
    }
    const savedGwp = tenantStorage.getItem(GWP_STORAGE_KEY);
    if (savedGwp) gwp = { ...DEFAULT_GWP, ...JSON.parse(savedGwp) };
  } catch {
    /* ignore corrupt storage */
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    factor: efTotalPerUnit(r, gwp),
    category: tabForEfId(r.id),
  }));
}

// Per-unit total using the editable GWP set. HFC/PFC GWPs stay per row.
export function efTotalPerUnit(e: Scope1EF, g: GwpSet = DEFAULT_GWP): number {
  return (
    e.co2 * g.co2 +
    e.ch4 * g.ch4 +
    e.n2o * g.n2o +
    e.hfc * e.hfcGwp +
    e.pfc * e.pfcGwp +
    e.sf6 * g.sf6
  );
}

const ITEM_ROWS: [string, string, string, string, string][] = [
  ["Stationary combustion", "ดีเซล - เครื่องกำเนิดไฟฟ้า/หม้อไอน้ำ", "Diesel - generator / boiler", "L", "SC-01"],
  ["Stationary combustion", "เบนซิน - เครื่องยนต์อยู่กับที่", "Gasoline - stationary engine", "L", "SC-02"],
  ["Stationary combustion", "LPG - หม้อไอน้ำ/เตา", "LPG - boiler / furnace", "kg", "SC-03"],
  ["Stationary combustion", "ก๊าซธรรมชาติ - หม้อไอน้ำ", "Natural gas - boiler", "m3", "SC-04"],
  ["Stationary combustion", "น้ำมันเตา - หม้อไอน้ำ", "Fuel oil / Bunker C - boiler", "kg", "SC-05"],
  ["Stationary combustion", "น้ำมันก๊าด / Jet A1 - เครื่องทำความร้อน", "Kerosene / Jet A1 - heater", "L", "SC-06"],
  ["Stationary combustion", "ถ่านหิน - หม้อไอน้ำ", "Coal - boiler", "kg", "SC-07"],
  ["Mobile combustion", "ดีเซล - รถบรรทุก/รถยนต์บริษัท", "Diesel - company vehicles/trucks", "L", "MB-01"],
  ["Mobile combustion", "เบนซิน - รถยนต์บริษัท", "Gasoline - company cars", "L", "MB-02"],
  ["Mobile combustion", "LPG - รถยนต์บริษัท", "LPG - company vehicles", "kg", "MB-03"],
  ["Mobile combustion", "NGV - รถยนต์ก๊าซธรรมชาติ", "Natural gas vehicle (NGV)", "m3", "MB-04"],
  ["Process emission", "การละลาย Hot melt", "Hot melt dissolution", "kg", "PR-01"],
  ["Process emission", "CO2 จากกระบวนการผลิตทั่วไป", "Generic process CO2", "kg", "PR-02"],
  ["Fugitive - refrigerant", "R32 - เครื่องปรับอากาศ", "R32 - air conditioner", "kg", "RF-01"],
  ["Fugitive - refrigerant", "R134a - เครื่องทำน้ำเย็น/แอร์รถยนต์", "R134a - chiller/car AC", "kg", "RF-02"],
  ["Fugitive - refrigerant", "R410A - เครื่องปรับอากาศ/Chiller", "R410A - air conditioner/chiller", "kg", "RF-03"],
  ["Fugitive - refrigerant", "R600a - ตู้เย็น", "R600a - refrigerator", "kg", "RF-04"],
  ["Fugitive - refrigerant", "R404A - ห้องเย็น", "R404A - cold room", "kg", "RF-05"],
  ["Fugitive - refrigerant", "R407C - เครื่องปรับอากาศ", "R407C - air conditioner", "kg", "RF-06"],
  ["Fugitive - refrigerant", "R22 - เครื่องปรับอากาศเก่า", "R22 - legacy air conditioner", "kg", "RF-07"],
  ["Fugitive - refrigerant", "R125 - ระบบทำความเย็น", "R125 - refrigeration system", "kg", "RF-08"],
  ["Fugitive - refrigerant", "R143a - ระบบทำความเย็น", "R143a - refrigeration system", "kg", "RF-09"],
  ["Fugitive - refrigerant", "R152a - เครื่องทำความเย็น", "R152a - refrigeration", "kg", "RF-10"],
  ["Fugitive - refrigerant", "R1234yf - แอร์รถยนต์", "R1234yf - car AC", "kg", "RF-11"],
  ["Fugitive - refrigerant", "R290 (โพรเพน) - ตู้เย็น/เครื่องทำความเย็น", "R290 (propane) - refrigeration", "kg", "RF-12"],
  ["Fugitive - refrigerant", "R744 (CO2) - ระบบทำความเย็น", "R744 (CO2) - refrigeration", "kg", "RF-13"],
  ["Fugitive - SF6", "SF6 - รั่วจากอุปกรณ์ปิดตัดไฟฟ้า", "SF6 - switchgear leakage", "kg", "RF-14"],
  ["Fire suppression", "ถังดับเพลิง CO2", "CO2 fire extinguisher", "kg", "FS-01"],
  ["Fire suppression", "FM-200 (HFC-227ea)", "FM-200 (HFC-227ea)", "kg", "FS-02"],
  ["Waste / wastewater", "CH4 - บ่อเกรอะ (Septic tank)", "CH4 - septic tank", "kg", "WW-01"],
  ["Waste / wastewater", "CH4 - บำบัดน้ำเสีย", "CH4 - wastewater treatment", "kg", "WW-02"],
  ["Waste / wastewater", "CH4 - หลุมฝังกลบ", "CH4 - landfill", "kg", "WW-03"],
  ["Other", "CO2 - งานเชื่อม/ก๊าซป้องกัน", "CO2 - welding / shielding gas", "kg", "OT-01"],
];

export const SCOPE1_ITEMS: Scope1Item[] = ITEM_ROWS.map((r, i) => ({
  no: i + 1,
  category: r[0],
  nameTh: r[1],
  nameEn: r[2],
  unit: r[3],
  efId: r[4],
}));

// id, name, unit, co2, ch4, n2o, hfc, pfc, sf6, hfcGwp, pfcGwp, sf6Gwp, source
const EF_ROWS: [string, string, string, number, number, number, number, number, number, number, number, number, string][] = [
  ["SC-01", "Diesel (stationary)", "L", 2.6878, 0.00014, 0.0000216, 0, 0, 0, 0, 0, 0, "IPCC 2006 / DEFRA (approx.)"],
  ["SC-02", "Gasoline (stationary)", "L", 2.3151, 0.00012, 0.0000192, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["SC-03", "LPG (stationary)", "kg", 2.9836, 0.0000473, 0.0000047, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["SC-04", "Natural gas", "m3", 2.0, 0.0000378, 0.0000038, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx., check local value)"],
  ["SC-05", "Fuel oil / Bunker C", "kg", 3.1, 0.00012, 0.0000062, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["SC-06", "Kerosene / Jet A1", "L", 2.52, 0, 0, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["SC-07", "Coal (bituminous)", "kg", 2.42, 0.0000258, 0.0000387, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["MB-01", "Diesel (vehicle)", "L", 2.6878, 0.00008, 0.000012, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["MB-02", "Gasoline (vehicle)", "L", 2.3151, 0.00011, 0.000015, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["MB-03", "LPG (vehicle)", "kg", 2.9836, 0.00004, 0.000004, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["MB-04", "Natural gas vehicle (NGV)", "m3", 2.0, 0.0001, 0.00001, 0, 0, 0, 0, 0, 0, "IPCC 2006 (approx.)"],
  ["PR-01", "Hot melt dissolution (process CO2)", "kg", 11.0, 0, 0, 0, 0, 0, 0, 0, 0, "Verification sheet (site value)"],
  ["PR-02", "Process CO2 (generic, carbon-based)", "kg", 1.0, 0, 0, 0, 0, 0, 0, 0, 0, "Mass balance (1 kg CO2 per kg)"],
  ["RF-01", "R32 refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 677, 0, 0, "TGO CFO EF / IPCC AR5"],
  ["RF-02", "R134a refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 1300, 0, 0, "TGO CFO EF / IPCC AR5"],
  ["RF-03", "R410A refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 1924, 0, 0, "TGO CFO EF / IPCC AR5"],
  ["RF-04", "R600a refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 3, 0, 0, "UK GHG conversion factors"],
  ["RF-05", "R404A refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 3922, 0, 0, "IPCC AR5"],
  ["RF-06", "R407C refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 1774, 0, 0, "IPCC AR5"],
  ["RF-07", "R22 refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 1810, 0, 0, "IPCC AR5"],
  ["RF-08", "R125 refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 3500, 0, 0, "IPCC AR5"],
  ["RF-09", "R143a refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 4470, 0, 0, "IPCC AR5"],
  ["RF-10", "R152a refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 124, 0, 0, "IPCC AR5"],
  ["RF-11", "R1234yf refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 0.501, 0, 0, "IPCC AR5"],
  ["RF-12", "R290 (propane) refrigerant leak", "kg", 0, 0, 0, 1, 0, 0, 3, 0, 0, "IPCC AR5 (approx.)"],
  ["RF-13", "R744 (CO2) refrigerant leak", "kg", 1, 0, 0, 0, 0, 0, 0, 0, 0, "CO2 = 1"],
  ["RF-14", "SF6 leak (switchgear)", "kg", 0, 0, 0, 0, 0, 1, 0, 0, 23500, "IPCC AR5"],
  ["FS-01", "CO2 fire extinguisher discharge", "kg", 1, 0, 0, 0, 0, 0, 0, 0, 0, "CO2 = 1"],
  ["FS-02", "FM-200 (HFC-227ea) fire suppression", "kg", 0, 0, 0, 1, 0, 0, 3220, 0, 0, "IPCC AR5"],
  ["WW-01", "Septic tank CH4 leakage", "kg", 0, 1, 0, 0, 0, 0, 0, 0, 0, "IPCC AR5 (CH4 GWP 28)"],
  ["WW-02", "Wastewater treatment CH4", "kg", 0, 1, 0, 0, 0, 0, 0, 0, 0, "IPCC AR5 (CH4 GWP 28)"],
  ["WW-03", "Landfill CH4 (site emission)", "kg", 0, 1, 0, 0, 0, 0, 0, 0, 0, "IPCC AR5 (CH4 GWP 28)"],
  ["OT-01", "Welding / shielding CO2", "kg", 1, 0, 0, 0, 0, 0, 0, 0, 0, "CO2 = 1"],
];

export const SCOPE1_EF: Scope1EF[] = EF_ROWS.map((r) => ({
  id: r[0],
  name: r[1],
  unit: r[2],
  co2: r[3],
  ch4: r[4],
  n2o: r[5],
  hfc: r[6],
  pfc: r[7],
  sf6: r[8],
  hfcGwp: r[9],
  pfcGwp: r[10],
  sf6Gwp: r[11],
  ch4Gwp: CH4_GWP,
  n2oGwp: N2O_GWP,
  source: r[12],
}));
