import React from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import CRM from "./pages/CRM";
import Reports from "./pages/Reports";
import LogoUpload from "./pages/LogoUpload";
import { AIProvider } from "./store/AIContext";

function App() {
  return (
    <AIProvider>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 p-6 overflow-y-auto">
          <h1 className="text-2xl font-bold mb-4 text-gray-800">
            Daycation Agent Dashboard
          </h1>
          <Dashboard />
          <CRM />
          <Reports />
          <LogoUpload />
        </div>
      </div>
    </AIProvider>
  );
}

export default App;