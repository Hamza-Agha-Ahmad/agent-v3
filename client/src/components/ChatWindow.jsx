import React from "react";

export default function ChatWindow() {
  return (
    <div className="flex flex-col w-full max-w-md h-[600px] bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-orange-500 text-white p-4 font-bold text-lg">
        Daycation Agent (WhatsApp Support)
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-gray-50">
        <div className="p-3 bg-gray-200 rounded-xl max-w-xs">
          👋 Hello! Welcome to Daycation. How can I help you today?
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 border-t bg-white flex items-center">
        <input
          type="text"
          placeholder="Type your message..."
          className="flex-1 border rounded-xl px-3 py-2 mr-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button className="bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600">
          Send
        </button>
      </div>
    </div>
  );
}
