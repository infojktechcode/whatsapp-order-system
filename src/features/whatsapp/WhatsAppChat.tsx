import { useState } from "react"

export function WhatsAppChat() {
  const [messages, setMessages] = useState<Array<{ from: "bot" | "user"; text: string }>>([
    { from: "bot", text: "Hello! Welcome to Dear Body. What would you like?" },
  ])
  const [input, setInput] = useState("")

  const send = async () => {
    if (!input.trim()) return
    setMessages((m) => [...m, { from: "user", text: input }])
    setInput("")
    setMessages((m) => [...m, { from: "bot", text: "Thanks! Our team will help you shortly." }])
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="space-y-2 mb-3">
        {messages.map((m, i) => (
          <div key={i} className={m.from === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block rounded-lg px-3 py-2 text-sm ${
                m.from === "user" ? "bg-green-100" : "bg-gray-100"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send()
          }}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={() => void send()}
          className="px-4 py-2 bg-[#25D366] text-white rounded-lg"
        >
          Send
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Demo chat UI. The live WhatsApp conversation state machine runs behind the WhatsApp Cloud
        API webhook (supabase/functions/whatsapp).
      </p>
    </div>
  )
}
