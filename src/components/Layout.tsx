import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import AiAssistant from "./AiAssistant";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { hasFeature } = useAuth();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 min-w-0 overflow-y-auto bg-gray-50 p-6 md:p-8">
          {children}
        </main>
      </div>
      {hasFeature("ai") && <AiAssistant />}
    </div>
  );
}
