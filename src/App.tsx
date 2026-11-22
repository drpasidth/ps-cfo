import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { AuthProvider, needsPayment, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Company from "./pages/Company";
import QualityManagement from "./pages/QualityManagement";
import Scope1 from "./pages/Scope1";
import Scope2 from "./pages/Scope2";
import Scope3 from "./pages/Scope3";
import Scope3List from "./pages/Scope3List";
import Scope3Significance from "./pages/Scope3Significance";
import Scope3Criteria from "./pages/Scope3Criteria";
import UncertaintyAssessment from "./pages/UncertaintyAssessment";
import Report from "./pages/Report";
import Export from "./pages/Export";
import EmissionFactors from "./pages/EmissionFactors";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Scope1Reference from "./pages/Scope1Reference";
import FeatureGate from "./components/FeatureGate";
import Billing from "./pages/Billing";
import Package from "./pages/Package";
import Team from "./pages/Team";
import Landing from "./pages/Landing";

// Protected area: requires a logged-in user. Each login loads its own tenant data.
function ProtectedLayout() {
  const { status, session } = useAuth();
  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">กำลังโหลด...</div>;
  }
  if (status === "anon") return <Navigate to="/welcome" replace />;
  // Not approved yet, or subscription ended: only the package / payment page is available.
  if (session && needsPayment(session)) return <Package standalone />;
  return (
    <AppProvider>
      <Layout>
        <Outlet />
      </Layout>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/welcome" element={<Landing />} />
          <Route element={<ProtectedLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="/company" element={<Company />} />
            <Route path="/quality" element={<QualityManagement />} />
            <Route path="/scope1" element={<FeatureGate feature="scope1"><Scope1 /></FeatureGate>} />
            <Route path="/scope2" element={<FeatureGate feature="scope2"><Scope2 /></FeatureGate>} />
            <Route path="/scope3" element={<FeatureGate feature="scope3"><Scope3 /></FeatureGate>} />
            <Route path="/scope3-list" element={<FeatureGate feature="scope3"><Scope3List /></FeatureGate>} />
            <Route path="/scope3-significance" element={<FeatureGate feature="scope3"><Scope3Significance /></FeatureGate>} />
            <Route path="/scope3-criteria" element={<FeatureGate feature="scope3"><Scope3Criteria /></FeatureGate>} />
            <Route path="/uncertainty" element={<FeatureGate feature="scope3"><UncertaintyAssessment /></FeatureGate>} />
            <Route path="/report" element={<FeatureGate feature="verification"><Report /></FeatureGate>} />
            <Route path="/export" element={<FeatureGate feature="verification"><Export /></FeatureGate>} />
            <Route path="/emission-factors" element={<FeatureGate feature="scope1"><EmissionFactors /></FeatureGate>} />
            <Route path="/scope1-items" element={<FeatureGate feature="scope1"><Scope1Reference mode="items" /></FeatureGate>} />
            <Route path="/ef-components" element={<FeatureGate feature="scope1"><Scope1Reference mode="ef" /></FeatureGate>} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/package" element={<Package />} />
            <Route path="/team" element={<Team />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
