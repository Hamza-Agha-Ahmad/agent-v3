import React, { createContext, useState } from "react";

export const AIContext = createContext();

export const AIProvider = ({ children }) => {
  const [aiToggles, setAiToggles] = useState({
    enableUpselling: true,
    enableRecommendations: true,
    enableWeather: false,
    enableConversationLogging: true,
    enableCustomTone: false,
  });

  const toggleAI = (key) =>
    setAiToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <AIContext.Provider value={{ aiToggles, toggleAI }}>
      {children}
    </AIContext.Provider>
  );
};