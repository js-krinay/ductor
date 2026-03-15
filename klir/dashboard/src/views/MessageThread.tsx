import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchHistory } from "@/api/client";
import { sendMessageStream } from "@/api/sse";
import type { MessageEntry } from "@/types/api";
import { formatRelativeTime, formatCost } from "@/lib/format";

export default function MessageThread() {
  const { chatId } = useParams<{ chatId: string }>();
  const chatIdNum = Number(chatId);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [_hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const valid = Boolean(chatId) && !Number.isNaN(chatIdNum);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!valid) return;
    setLoading(true);
    setLoadError(null);
    fetchHistory(chatIdNum, { limit: 50 })
      .then((res) => {
        setMessages(res.messages.reverse());
        setHasMore(res.has_more);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, [chatIdNum, valid]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, scrollToBottom]);

  if (!valid) {
    return <Navigate to="/sessions" replace />;
  }

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");

    // Add user message
    const userMsg: MessageEntry = {
      id: `temp-${Date.now()}`,
      ts: Date.now() / 1000,
      origin: "DASHBOARD",
      chat_id: chatIdNum,
      topic_id: null,
      direction: "inbound",
      text,
      provider: "",
      model: "",
      session_id: "",
      session_name: "",
      cost_usd: 0,
      tokens: 0,
      elapsed_seconds: 0,
      is_error: false,
      metadata: {},
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamText("");
    setToolActivity(null);

    await sendMessageStream(chatIdNum, text, {
      onTextDelta: (delta) => setStreamText((prev) => prev + delta),
      onToolActivity: (tool) => setToolActivity(tool),
      onSystemStatus: () => {},
      onResult: (result) => {
        const responseMsg: MessageEntry = {
          id: `temp-resp-${Date.now()}`,
          ts: Date.now() / 1000,
          origin: "DASHBOARD",
          chat_id: chatIdNum,
          topic_id: null,
          direction: "outbound",
          text: result.text,
          provider: "",
          model: "",
          session_id: "",
          session_name: "",
          cost_usd: result.cost_usd,
          tokens: result.tokens,
          elapsed_seconds: result.elapsed_seconds,
          is_error: false,
          metadata: {},
        };
        setMessages((prev) => [...prev, responseMsg]);
        setStreamText("");
        setToolActivity(null);
        setStreaming(false);
      },
      onError: (err) => {
        setStreamText((prev) => prev + `\n\n_${err}_`);
        setStreaming(false);
      },
    });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">{loadError}</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-4 text-2xl font-bold">Chat {chatId}</h1>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto pb-4">
        {messages.length === 0 && !streaming && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No messages yet
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {streaming && streamText && (
          <div className="rounded-lg bg-card p-4">
            <div className="prose prose-invert max-w-none text-sm">
              <ReactMarkdown>{streamText}</ReactMarkdown>
            </div>
            {toolActivity && (
              <Badge variant="secondary" className="mt-2 text-xs">
                Using: {toolActivity}
              </Badge>
            )}
          </div>
        )}

        {streaming && !streamText && (
          <div className="rounded-lg bg-card p-4 text-sm text-muted-foreground animate-pulse">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 border-t pt-4"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          disabled={streaming}
          autoFocus
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageEntry }) {
  const isOutbound = message.direction === "outbound";

  return (
    <div className={`rounded-lg p-4 ${isOutbound ? "bg-card" : "bg-accent/30"}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{isOutbound ? "Assistant" : "You"}</span>
        <span>{formatRelativeTime(message.ts)}</span>
        {isOutbound && message.cost_usd > 0 && <span>{formatCost(message.cost_usd)}</span>}
      </div>
      {isOutbound ? (
        <div className="prose prose-invert max-w-none text-sm">
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
      )}
    </div>
  );
}
