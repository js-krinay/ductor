import { useAuthStore } from "@/store/auth";
import { useDashboardStore } from "@/store/dashboard";
import type { WsServerMessage } from "@/types/api";

const VALID_WS_TYPES = new Set(["auth_ok", "snapshot", "event", "pong", "error"]);

function isValidWsMessage(msg: unknown): msg is WsServerMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  if (typeof obj.type !== "string" || !VALID_WS_TYPES.has(obj.type)) return false;
  if (obj.type === "snapshot" && (typeof obj.data !== "object" || obj.data === null)) return false;
  if (obj.type === "event" && (typeof obj.data !== "object" || obj.data === null)) return false;
  return true;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;
const PING_INTERVAL = 25_000;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/dashboard`;
}

export function connect(): void {
  const token = useAuthStore.getState().token;
  if (!token) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    // Token sent post-connect; server buffers until auth_ok. Acceptable for local deployment over HTTPS.
    ws!.send(JSON.stringify({ type: "auth", token }));
  };

  ws.onmessage = (ev) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!isValidWsMessage(parsed)) {
      console.warn("[ws] invalid message shape:", parsed);
      return;
    }
    const msg = parsed;
    const store = useDashboardStore.getState();

    switch (msg.type) {
      case "auth_ok":
        reconnectDelay = 1000;
        store.setConnected(true);
        startPing();
        break;
      case "snapshot":
        store.applySnapshot(msg.data);
        break;
      case "event":
        store.applyEvent(msg.event, msg.data);
        break;
      case "error":
        if (msg.message?.includes("auth")) {
          useAuthStore.getState().clearToken();
        }
        break;
      case "pong":
        break;
    }
  };

  ws.onclose = () => {
    useDashboardStore.getState().setConnected(false);
    stopPing();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  stopPing();
  ws?.close();
  ws = null;
}

function scheduleReconnect(): void {
  if (!useAuthStore.getState().token) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, PING_INTERVAL);
}

function stopPing(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}
