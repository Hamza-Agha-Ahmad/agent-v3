import { useState } from "react";

export default function App() {
  const [messages, setMessages] = useState([
    { sender: "bot", text: "👋 Welcome! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;

    // Add user message
    setMessages([...messages, { sender: "user", text: input }]);

    // Reset input
    setInput("");

    // Placeholder for AI/Backend response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "🤖 Thanks for your message! Our AI will assist you shortly." },
      ]);
    }, 800);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-4 flex flex-col">
        <h1 className="text-xl font-bold text-center mb-4 text-orange-600">
          Daycation WhatsApp Care
        </h1>

        {/* Chat Window */}
        <div className="flex-1 overflow-y-auto border rounded-lg p-2 mb-4 bg-gray-50 h-96">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 my-1 rounded-lg w-fit max-w-[80%] ${
                msg.sender === "user"
                  ? "ml-auto bg-orange-500 text-white"
                  : "mr-auto bg-gray-200 text-gray-800"
              }`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 border rounded-lg px-3 py-2 outline-none"
          />
          <button
            onClick={sendMessage}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
