import { useAuthStore } from "@/store/auth";

export interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolActivity: (tool: string) => void;
  onSystemStatus: (label: string) => void;
  onResult: (data: { text: string; cost_usd: number; tokens: number; elapsed_seconds: number }) => void;
  onError: (err: string) => void;
}

export async function sendMessageStream(
  chatId: number,
  text: string,
  callbacks: StreamCallbacks,
  topicId?: number,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api/sessions/${chatId}/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, topic_id: topicId ?? null, stream: true }),
  });

  if (res.status === 401) {
    useAuthStore.getState().clearToken();
    callbacks.onError("Unauthorized");
    return;
  }
  if (!res.ok) {
    callbacks.onError(`Error: ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ") && currentEvent) {
          let data;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            currentEvent = "";
            continue;
          }
          switch (currentEvent) {
            case "text_delta":
              callbacks.onTextDelta(data.text);
              break;
            case "tool_activity":
              callbacks.onToolActivity(data.tool);
              break;
            case "system_status":
              callbacks.onSystemStatus(data.label);
              break;
            case "result":
              callbacks.onResult(data);
              break;
          }
          currentEvent = "";
        }
      }
    }
  } catch {
    callbacks.onError("Stream interrupted");
  }
}
