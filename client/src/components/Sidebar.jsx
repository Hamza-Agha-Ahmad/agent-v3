import React, { useContext } from "react";
import { AIContext } from "../store/AIContext";

function Sidebar() {
  const { aiToggles, toggleAI } = useContext(AIContext);

  return (
    <div className="w-64 bg-orange-500 text-white p-4 flex flex-col">
      <h2 className="text-2xl font-bold mb-6">Daycation Agent</h2>

      <nav className="flex flex-col space-y-4">
        <a href="#dashboard" className="hover:underline">Dashboard</a>
        <a href="#crm" className="hover:underline">CRM</a>
        <a href="#reports" className="hover:underline">Reports</a>
        <a href="#logo" className="hover:underline">Logo Upload</a>
      </nav>

      <div id="ai" className="mt-auto p-3 bg-white text-black rounded shadow">
        <h3 className="font-semibold mb-2">AI Controls</h3>
        {Object.keys(aiToggles).map((key) => (
          <label key={key} className="flex items-center mb-1 text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={aiToggles[key]}
              onChange={() => toggleAI(key)}
            />
            {key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (str) => str.toUpperCase())}
          </label>
        ))}
        <select className="w-full border p-1 mt-2 text-sm">
          <option>Friendly</option>
          <option>Formal</option>
          <option>Persuasive</option>
          <option>Concise</option>
        </select>
      </div>
    </div>
  );
}

export default Sidebar;