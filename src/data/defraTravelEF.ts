// UK DEFRA/DESNZ GHG Conversion Factors 2026 - business travel & commuting.
// Source file: public/DEFRA_2026_travel_EF.xlsx (sheets Air, Land_Sea).
// NOTE: values were taken from a secondary site in that workbook. Verify against the
// official DEFRA workbook before using in a verified report. TGO factors take priority.
import type { Scope3Category } from "./scope3Reference";

export interface DefraTravelRow {
  key: string;
  name: string;
  unit: string;
  factor: number;
  // Categories that offer this factor. Air is business travel only.
  roles: Scope3Category[];
}

const BT: Scope3Category[] = ["business_travel"];
const BT_CM: Scope3Category[] = ["business_travel", "commuting"];

// Air: "With RF + WTT" basis (kgCO2e per passenger-km)
const AIR: DefraTravelRow[] = [
  { key: "AIR-01", name: "เครื่องบิน: ในประเทศ UK เฉลี่ย (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.26278, roles: BT },
  { key: "AIR-02", name: "เครื่องบิน: ระยะสั้น เฉลี่ย (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.15072, roles: BT },
  { key: "AIR-03", name: "เครื่องบิน: ระยะสั้น ชั้นประหยัด (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.14825, roles: BT },
  { key: "AIR-04", name: "เครื่องบิน: ระยะสั้น ชั้นธุรกิจ (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.22236, roles: BT },
  { key: "AIR-05", name: "เครื่องบิน: ระยะไกล เฉลี่ย (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.18495, roles: BT },
  { key: "AIR-06", name: "เครื่องบิน: ระยะไกล ชั้นประหยัด (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.14165, roles: BT },
  { key: "AIR-07", name: "เครื่องบิน: ระยะไกล ชั้นประหยัดพรีเมียม (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.22663, roles: BT },
  { key: "AIR-08", name: "เครื่องบิน: ระยะไกล ชั้นธุรกิจ (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.41077, roles: BT },
  { key: "AIR-09", name: "เครื่องบิน: ระยะไกล ชั้นหนึ่ง (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.56658, roles: BT },
  { key: "AIR-10", name: "เครื่องบิน: ระหว่างประเทศ (ไม่ใช่ UK-UK) เฉลี่ย (DEFRA 2026, with RF + WTT)", unit: "kgCO2e/pkm", factor: 0.16415, roles: BT },
];

// Land & sea
const LAND_SEA: DefraTravelRow[] = [
  { key: "LS-01", name: "รถยนต์ส่วนตัว: เบนซินเฉลี่ย (DEFRA 2026)", unit: "kgCO2e/km (vehicle)", factor: 0.16152, roles: BT_CM },
  { key: "LS-02", name: "รถยนต์ส่วนตัว: ดีเซลเฉลี่ย (DEFRA 2026)", unit: "kgCO2e/km (vehicle)", factor: 0.17265, roles: BT_CM },
  { key: "LS-03", name: "รถยนต์ส่วนตัว: ไฮบริดเฉลี่ย (DEFRA 2026)", unit: "kgCO2e/km (vehicle)", factor: 0.12961, roles: BT_CM },
  { key: "LS-04", name: "รถยนต์ส่วนตัว: ไฟฟ้า 100% เฉลี่ย (DEFRA 2026)", unit: "kgCO2e/km (vehicle)", factor: 0.02951, roles: BT_CM },
  { key: "LS-05", name: "แท็กซี่: Black cab (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.20402, roles: BT },
  { key: "LS-06", name: "รถโดยสาร: ประจำทางเฉลี่ย (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.10151, roles: BT_CM },
  { key: "LS-07", name: "รถโดยสาร: ประจำทางในลอนดอน (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.0636, roles: BT_CM },
  { key: "LS-08", name: "รถโดยสาร: ประจำทางนอกลอนดอน (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.12552, roles: BT_CM },
  { key: "LS-09", name: "รถโดยสารระยะไกล (Coach) (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.03948, roles: BT_CM },
  { key: "LS-10", name: "รถไฟแห่งชาติ (National rail) (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.03092, roles: BT_CM },
  { key: "LS-11", name: "รถไฟระหว่างประเทศ (International rail) (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.01135, roles: BT_CM },
  { key: "LS-12", name: "รถไฟใต้ดินลอนดอน (London Underground) (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.01549, roles: BT_CM },
  { key: "LS-13", name: "รถรางและรถไฟฟ้าเบา (Light rail & tram) (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.02121, roles: BT_CM },
  { key: "LS-14", name: "เรือเฟอร์รี่ ผู้โดยสารเดินเท้า (DEFRA 2026)", unit: "kgCO2e/passenger-km", factor: 0.01871, roles: BT },
];

export const DEFRA_TRAVEL_ROWS: DefraTravelRow[] = [...AIR, ...LAND_SEA];
