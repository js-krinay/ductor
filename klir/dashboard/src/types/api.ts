// --- DTOs (match backend dashboard.py *_to_dto functions) ---

export interface SessionDTO {
  chat_id: number;
  topic_id: number | null;
  user_id: number | null;
  topic_name: string | null;
  provider: string;
  model: string;
  session_id: string;
  message_count: number;
  total_cost_usd: number;
  total_tokens: number;
  created_at: number;
  last_active: number;
  thinking_level: string | null;
}

export interface NamedSessionDTO {
  name: string;
  chat_id: number;
  provider: string;
  model: string;
  session_id: string;
  prompt_preview: string;
  status: string;
  created_at: number;
  message_count: number;
}

export interface AgentHealthDTO {
  name: string;
  status: string;
  uptime_seconds: number;
  restart_count: number;
  last_crash_time: number | null;
  last_crash_error: string | null;
}

export interface CronJobDTO {
  id: string;
  title: string;
  schedule: string;
  enabled: boolean;
  consecutive_errors: number;
  last_error: string | null;
  last_duration_ms: number | null;
  provider: string;
  model: string;
}

export interface CronRunEntry {
  ts: number;
  job_id: string;
  status: string;
  duration_ms: number;
  delivery_status: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  summary: string;
  error: string | null;
}

export interface TaskDTO {
  task_id: string;
  chat_id: number;
  parent_agent: string;
  name: string;
  prompt_preview: string;
  provider: string;
  model: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  elapsed_seconds: number;
  error: string | null;
  num_turns: number;
  question_count: number;
  last_question: string | null;
}

export interface ProcessDTO {
  chat_id: number;
  label: string;
  pid: number;
  registered_at: number;
}

export interface CommandDTO {
  name: string;
  description: string;
  category: "core" | "agent" | "skill";
  quick: boolean;
}

export interface MessageEntry {
  id: string;
  ts: number;
  origin: string;
  chat_id: number;
  topic_id: number | null;
  direction: "inbound" | "outbound";
  text: string;
  provider: string;
  model: string;
  session_id: string;
  session_name: string;
  cost_usd: number;
  tokens: number;
  elapsed_seconds: number;
  is_error: boolean;
  metadata: Record<string, unknown>;
}

// --- Snapshot ---

export interface Snapshot {
  sessions: SessionDTO[];
  named_sessions: NamedSessionDTO[];
  agents: AgentHealthDTO[];
  cron_jobs: CronJobDTO[];
  tasks: TaskDTO[];
  processes: ProcessDTO[];
  observers: Record<string, boolean>;
  /** Intentionally loose — config shape varies by deployment and version. */
  config: Record<string, unknown>;
}

// --- WebSocket messages ---

export interface WsAuthMessage {
  type: "auth";
  token: string;
}

export interface WsAuthOk {
  type: "auth_ok";
}

export interface WsSnapshot {
  type: "snapshot";
  ts: number;
  data: Snapshot;
}

export interface WsEvent {
  type: "event";
  event: string;
  ts: number;
  data: Record<string, unknown>;
}

export interface WsPong {
  type: "pong";
  ts: number;
}

export interface WsError {
  type: "error";
  message: string;
}

export type WsServerMessage = WsAuthOk | WsSnapshot | WsEvent | WsPong | WsError;

// --- SSE events ---

export interface SseTextDelta {
  event: "text_delta";
  text: string;
}

export interface SseToolActivity {
  event: "tool_activity";
  tool: string;
}

export interface SseSystemStatus {
  event: "system_status";
  label: string;
}

export interface SseResult {
  event: "result";
  text: string;
  cost_usd: number;
  tokens: number;
  elapsed_seconds: number;
}

export type SseEvent = SseTextDelta | SseToolActivity | SseSystemStatus | SseResult;

// --- REST responses ---

export interface HealthResponse {
  status: string;
  connections: { api_clients: number; dashboard_clients: number };
  observers: Record<string, boolean>;
}

export interface HistoryResponse {
  messages: MessageEntry[];
  has_more: boolean;
  next_cursor: number | null;
}
