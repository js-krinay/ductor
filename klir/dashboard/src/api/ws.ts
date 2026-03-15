import { useAuthStore } from "@/store/auth";
import { useDashboardStore } from "@/store/dashboard";
import type { WsServerMessage } from "@/types/api";

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
    ws!.send(JSON.stringify({ type: "auth", token }));
  };

  ws.onmessage = (ev) => {
    let msg: WsServerMessage;
    try {
      msg = JSON.parse(ev.data) as WsServerMessage;
    } catch {
      return;
    }
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
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    connect();
  }, reconnectDelay);
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
