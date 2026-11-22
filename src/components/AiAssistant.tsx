import { useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { apiJson } from "../api";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  // Stable per page visit; n8n uses it to keep the conversation memory.
  const sessionId = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const history = messages;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await apiJson<{ reply: string }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, history, sessionId: sessionId.current }),
      });
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-purple-600 px-4 py-3 text-white">
            <span className="font-semibold">AI Assistant</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.length === 0 && (
              <p className="text-gray-500">พิมพ์คำถามเกี่ยวกับการคำนวณคาร์บอน Scope 1–3 ได้เลย</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                  m.role === "user" ? "ml-8 bg-purple-100 text-gray-900" : "mr-8 bg-gray-100 text-gray-800"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-gray-400">กำลังตอบ...</p>}
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-gray-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-md bg-purple-600 px-3 py-2 text-white disabled:opacity-50"
              aria-label="ส่ง"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="AI Assistant"
        title="AI Assistant"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </>
  );
}
