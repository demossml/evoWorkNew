import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Send, X, Trash2, Loader2 } from "lucide-react";
import { client } from "@shared/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  contextType: "product" | "store";
  entityId?: string;
  entityName?: string;
  onClose: () => void;
}

export function AIChatPanel({ contextType, entityId, entityName, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setStreamingContent("");

    try {
      const history = [...messages, userMsg].slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const apiPath = contextType === "product"
        ? (client.api.products as any)["ai-chat"]
        : (client.api.shops as any)["ai-chat"];

      const res = await apiPath.$post({
        json: {
          message: text,
          history,
          entityId: entityId || undefined,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || data.content || JSON.stringify(data);
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Ошибка: не удалось получить ответ от AI." }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Ошибка: ${err.message || "неизвестная ошибка"}` }]);
    } finally {
      setLoading(false);
      setStreamingContent("");
    }
  };

  const clearHistory = async () => {
    try {
      const apiPath = contextType === "product"
        ? (client.api.products as any)["ai-chat-clear"]
        : (client.api.shops as any)["ai-chat-clear"];
      await apiPath.$post({ json: { entityId: entityId || undefined } });
    } catch { /* ignore */ }
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:relative bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl max-h-[70vh] flex flex-col"
      style={{ maxWidth: "100%", margin: "0 auto" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-medium">
              AI-ассистент {entityName ? `— ${entityName}` : ""}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {contextType === "product" ? "Анализ товара" : "Анализ точки"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-muted"
            title="Очистить историю"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[40vh]">
        {messages.length === 0 && !loading && (
          <div className="text-center text-xs text-muted-foreground py-8">
            <Brain className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p>Задайте вопрос о {contextType === "product" ? "товаре" : "магазине"}</p>
            <p className="opacity-60 mt-1">Например: «Почему упала маржа?» или «Что делать с возвратами?»</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 text-xs flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-violet-500" />
              <span className="text-muted-foreground">AI думает...</span>
              {streamingContent && <span>{streamingContent}</span>}
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спросите о метриках, трендах, рекомендациях..."
            className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
