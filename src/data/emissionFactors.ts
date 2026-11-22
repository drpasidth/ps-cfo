/**
 * Emission factors sourced from TGO (Thailand Greenhouse Gas Management Organization)
 * EF_CFP_TGO_2022_July and EF_CFO_TGO_2022_Apr reference data.
 * Units are kgCO2e per activity unit unless noted.
 */

import { getScope1EfOptions } from "./scope1Reference";
import { SCOPE3_AS_EMISSION_FACTORS, type Scope3Category } from "./scope3Reference";

export interface EmissionFactor {
  id: string;
  name: string;
  thaiName?: string;
  unit: string;
  factor: number;
  category: "stationary" | "mobile" | "fugitive" | "electricity" | Scope3Category;
  description?: string;
  source?: string;
}

export const SCOPE1_STATIONARY: EmissionFactor[] = [
  {
    id: "diesel",
    name: "Diesel (น้ำมันดีเซล)",
    unit: "kg",
    factor: 0.3522,
    category: "stationary",
    description: "น้ำมันดีเซลที่ได้จากกระบวนการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "fuel_oil",
    name: "Fuel Oil (น้ำมันเตา)",
    unit: "kg",
    factor: 0.3743,
    category: "stationary",
    description: "น้ำมันเตาที่ได้จากกระบวนการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "lpg",
    name: "LPG Mixed (ก๊าซหุงต้มแบบผสม)",
    unit: "kg",
    factor: 0.8582,
    category: "stationary",
    description: "ก๊าซหุงต้มแบบผสมจากกระบวนการกลั่นน้ำมันดิบและแยกก๊าซธรรมชาติ",
    source: "TGO National LCI Database",
  },
  {
    id: "lpg_refining",
    name: "ก๊าซหุงต้ม (จากการกลั่นน้ำมันดิบ)",
    unit: "kg",
    factor: 0.4267,
    category: "stationary",
    description: "ก๊าซหุงต้มที่ได้จากกระบวนการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "natural_gas_kg",
    name: "Natural Gas (ก๊าซธรรมชาติแบบผสม)",
    unit: "kg",
    factor: 0.7544,
    category: "stationary",
    description: "ก๊าซธรรมชาติผสม (ไทย + พม่า + LNG)",
    source: "TGO National LCI Database",
  },
  {
    id: "natural_gas_m3",
    name: "Natural Gas (ก๊าซธรรมชาติแบบผสม)",
    unit: "m3",
    factor: 0.5767,
    category: "stationary",
    description: "ก๊าซธรรมชาติผสม - หน่วยปริมาตร",
    source: "TGO National LCI Database",
  },
  {
    id: "gasoline",
    name: "Gasoline (แก๊สโซลีน / เบนซิน)",
    unit: "kg",
    factor: 0.4024,
    category: "stationary",
    description: "น้ำมันเบนซินที่ได้จากกระบวนการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "kerosene",
    name: "Kerosene / Jet Oil (น้ำมันก๊าด / น้ำมันเครื่องบิน)",
    unit: "kg",
    factor: 0.3284,
    category: "stationary",
    description: "น้ำมันก๊าดหรือน้ำมันเครื่องบินจากการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "naphtha",
    name: "Naphtha (แนฟทา)",
    unit: "kg",
    factor: 0.2972,
    category: "stationary",
    description: "แนฟทาจากกระบวนการกลั่นน้ำมันดิบ",
    source: "TGO National LCI Database",
  },
  {
    id: "charcoal",
    name: "Charcoal (ถ่านไม้)",
    unit: "kg",
    factor: 1.0054,
    category: "stationary",
    description: "ถ่านไม้",
    source: "Ecoinvent 2.2 / IPCC 2007",
  },
  {
    id: "coal",
    name: "Coal / Lignite (ถ่านหิน)",
    unit: "kg",
    factor: 0.1187,
    category: "stationary",
    description: "ถ่านหินลิกไนต์จากเหมืองถุง",
    source: "Ecoinvent 2.2 / IPCC 2007",
  },
];

export const SCOPE1_MOBILE: EmissionFactor[] = [
  {
    id: "truck_small_diesel_0",
    name: "รถบรรทุก 4 ล้อ ขนาดเล็ก (สูงสุด 1.5 ตัน) - ดีเซล 0% Loading",
    unit: "km",
    factor: 0.2415,
    category: "mobile",
    description: "รถบรรทุกขนาดเล็ก วิ่งแบบปกติ 0% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_small_diesel_50",
    name: "รถบรรทุก 4 ล้อ ขนาดเล็ก (สูงสุด 1.5 ตัน) - ดีเซล 50% Loading",
    unit: "tkm",
    factor: 0.3805,
    category: "mobile",
    description: "รถบรรทุกขนาดเล็ก วิ่งแบบปกติ 50% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_small_diesel_100",
    name: "รถบรรทุก 4 ล้อ ขนาดเล็ก (สูงสุด 1.5 ตัน) - ดีเซล 100% Loading",
    unit: "tkm",
    factor: 0.2154,
    category: "mobile",
    description: "รถบรรทุกขนาดเล็ก วิ่งแบบปกติ 100% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_medium_diesel_0",
    name: "รถบรรทุก 4 ล้อ (สูงสุด 7 ตัน) - ดีเซล 0% Loading",
    unit: "km",
    factor: 0.3345,
    category: "mobile",
    description: "รถบรรทุกขนาดกลาง วิ่งแบบปกติ 0% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_medium_diesel_50",
    name: "รถบรรทุก 4 ล้อ (สูงสุด 7 ตัน) - ดีเซล 50% Loading",
    unit: "tkm",
    factor: 0.3401,
    category: "mobile",
    description: "รถบรรทุกขนาดกลาง วิ่งแบบปกติ 50% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_medium_diesel_100",
    name: "รถบรรทุก 4 ล้อ (สูงสุด 7 ตัน) - ดีเซล 100% Loading",
    unit: "tkm",
    factor: 0.1835,
    category: "mobile",
    description: "รถบรรทุกขนาดกลาง วิ่งแบบปกติ 100% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_large_diesel_0",
    name: "รถบรรทุก 6 ล้อ ขนาดเล็ก (สูงสุด 8.5 ตัน) - ดีเซล 0% Loading",
    unit: "km",
    factor: 0.4069,
    category: "mobile",
    description: "รถบรรทุก 6 ล้อ วิ่งปกติ 0% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_large_diesel_50",
    name: "รถบรรทุก 6 ล้อ ขนาดเล็ก (สูงสุด 8.5 ตัน) - ดีเซล 50% Loading",
    unit: "tkm",
    factor: 0.1198,
    category: "mobile",
    description: "รถบรรทุก 6 ล้อ วิ่งปกติ 50% Loading",
    source: "TGO National LCI Database",
  },
  {
    id: "truck_large_diesel_100",
    name: "รถบรรทุก 6 ล้อ ขนาดเล็ก (สูงสุด 8.5 ตัน) - ดีเซล 100% Loading",
    unit: "tkm",
    factor: 0.0653,
    category: "mobile",
    description: "รถบรรทุก 6 ล้อ วิ่งปกติ 100% Loading",
    source: "TGO National LCI Database",
  },
];

export const SCOPE1_FUGITIVE: EmissionFactor[] = [
  {
    id: "hfc_134a",
    name: "HFC-134a (สารทำความเย็น)",
    unit: "kg",
    factor: 1430,
    category: "fugitive",
    description: "GWP ตาม IPCC AR5 (รอการทวนสอบ)",
    source: "IPCC AR5 GWP",
  },
  {
    id: "hfc_404a",
    name: "HFC-404A (สารทำความเย็น)",
    unit: "kg",
    factor: 3922,
    category: "fugitive",
    description: "GWP ตาม IPCC AR5",
    source: "IPCC AR5 GWP",
  },
  {
    id: "hfc_410a",
    name: "HFC-410A (สารทำความเย็น)",
    unit: "kg",
    factor: 2088,
    category: "fugitive",
    description: "GWP ตาม IPCC AR5",
    source: "IPCC AR5 GWP",
  },
  {
    id: "r22",
    name: "R-22 / HCFC-22 (สารทำความเย็น)",
    unit: "kg",
    factor: 1810,
    category: "fugitive",
    description: "GWP ตาม IPCC AR5",
    source: "IPCC AR5 GWP",
  },
  {
    id: "sf6",
    name: "SF6 (ก๊าซซัลเฟอร์เฮกซาฟลูออไรด์)",
    unit: "kg",
    factor: 23500,
    category: "fugitive",
    description: "GWP ตาม IPCC AR5",
    source: "IPCC AR5 GWP",
  },
  {
    id: "co2_fire",
    name: "CO2 (ระบบดับเพลิง / กระบวนการ)",
    unit: "kg",
    factor: 1,
    category: "fugitive",
    description: "คาร์บอนไดออกไซด์ GWP = 1",
    source: "IPCC AR5 GWP",
  },
];

export const SCOPE2_ELECTRICITY: EmissionFactor[] = [
  {
    id: "grid_mix",
    name: "Electricity Grid Mix (ไฟฟ้าจากระบบส่งจ่าย)",
    unit: "kWh",
    factor: 0.5986,
    category: "electricity",
    description: "ไฟฟ้าแบบ grid mix ปี 2016-2018 (Gate to Gate)",
    source: "TGO National LCI Database",
  },
];

export interface GWPValue {
  gas: string;
  gwp: number;
  note?: string;
}

export const GWP_VALUES: GWPValue[] = [
  { gas: "CO2", gwp: 1, note: "คาร์บอนไดออกไซด์" },
  { gas: "CH4 (fossil)", gwp: 30, note: "มีเทนจากเชื้อเพลิงฟอสซิล (IPCC AR5)" },
  { gas: "CH4 (biogenic)", gwp: 28, note: "มีเทนจากแหล่งชีวภาพ (IPCC AR5)" },
  { gas: "N2O", gwp: 265, note: "ไนตรัสออกไซด์ (IPCC AR5)" },
];

// Scope 1 factors from the EF Components table (with saved edits and GWP100), so
// every activity's EF_ID resolves to a name on the Dashboard and elsewhere.
const SCOPE1_EF_COMPONENTS: EmissionFactor[] = getScope1EfOptions().map((o) => ({
  id: o.id,
  name: `${o.id} - ${o.name}`,
  unit: o.unit,
  factor: o.factor,
  category: o.category,
  source: "EF Components (Scope 1)",
}));

export const ALL_EMISSION_FACTORS: EmissionFactor[] = [
  ...SCOPE1_STATIONARY,
  ...SCOPE1_MOBILE,
  ...SCOPE1_FUGITIVE,
  ...SCOPE2_ELECTRICITY,
  ...SCOPE1_EF_COMPONENTS,
  ...SCOPE3_AS_EMISSION_FACTORS,
];

export function findFactor(id: string): EmissionFactor | undefined {
  return ALL_EMISSION_FACTORS.find((f) => f.id === id);
}
