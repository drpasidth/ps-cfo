import { createContext, useContext, useReducer, useEffect, useState } from "react";
import type {
  AppData,
  CompanyProfile,
  ActivityRecord,
  Period,
} from "../types";
import { DEFAULT_COMPANY, periodForYear, assignActivityYears } from "../types";
import type { EmissionFactor } from "../data/emissionFactors";
import { ALL_EMISSION_FACTORS } from "../data/emissionFactors";
import { apiFetch } from "../api";

export type AppAction =
  | { type: "SET_COMPANY"; payload: Partial<CompanyProfile> }
  | { type: "ADD_ACTIVITY"; payload: Omit<ActivityRecord, "id" | "date"> }
  | { type: "UPDATE_ACTIVITY"; payload: Partial<ActivityRecord> & { id: string } }
  | { type: "DELETE_ACTIVITY"; payload: string }
  | { type: "SET_ACTIVITIES"; payload: ActivityRecord[] }
  | { type: "RESET_DATA" }
  | { type: "SET_LOADING"; payload: boolean };

interface AppState {
  company: CompanyProfile;
  activities: ActivityRecord[];
  factors: EmissionFactor[];
  loading: boolean;
}

const initialState: AppState = {
  company: { ...DEFAULT_COMPANY },
  activities: [],
  factors: ALL_EMISSION_FACTORS,
  loading: true,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_COMPANY":
      return { ...state, company: { ...state.company, ...action.payload } };
    case "ADD_ACTIVITY": {
      const record: ActivityRecord = {
        ...action.payload,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
      };
      return { ...state, activities: [...state.activities, record] };
    }
    case "UPDATE_ACTIVITY": {
      return {
        ...state,
        activities: state.activities.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    }
    case "DELETE_ACTIVITY":
      return {
        ...state,
        activities: state.activities.filter((a) => a.id !== action.payload),
      };
    case "SET_ACTIVITIES":
      return { ...state, activities: action.payload };
    case "RESET_DATA":
      return { ...initialState, loading: false, factors: state.factors };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  year: number; // ปีที่กำลังกรอกข้อมูล (ค.ศ.)
  setYear: (y: number) => void;
  period: Period; // ประเภทของปีที่เลือก (current / base / other)
} | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // ปีที่กำลังกรอกข้อมูลในหน้า Scope (ใช้ร่วมกันทุกสโคป) ค่าเริ่มต้นคือปีที่รายงาน
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? (Number(state.company.reportingYear) || new Date().getFullYear());
  const period = periodForYear(year, state.company);
  const setYear = (y: number) => setSelectedYear(y);

  // Load company data and activity records from the SQLite API on mount.
  useEffect(() => {
    apiFetch("/api/data")
      .then((response) => response.ok ? response.json() : Promise.reject(response.statusText))
      .then((data: AppData) => {
        if (data.company) dispatch({ type: "SET_COMPANY", payload: data.company });
        const loadedCompany = { ...DEFAULT_COMPANY, ...(data.company || {}) };
        dispatch({ type: "SET_ACTIVITIES", payload: assignActivityYears(data.activities || [], loadedCompany) });
      })
      .catch((error) => console.error("Could not load SQLite data:", error))
      .finally(() => dispatch({ type: "SET_LOADING", payload: false }));
  }, []);

  // Persist company data and activity records to SQLite through the API.
  useEffect(() => {
    if (state.loading) return;
    const data: AppData = { company: state.company, activities: state.activities };
    apiFetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch((error) => console.error("Could not save SQLite data:", error));
  }, [state.company, state.activities, state.loading]);

  return (
    <AppContext.Provider value={{ state, dispatch, year, setYear, period }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// Calculation helpers exported for use in components
export function roundUp2(value: number): number {
  return Math.ceil(value * 100) / 100;
}

export function roundUpInt(value: number): number {
  return Math.ceil(value);
}

export function calcCO2e(activityData: number, factor: number): number {
  return activityData * factor;
}
