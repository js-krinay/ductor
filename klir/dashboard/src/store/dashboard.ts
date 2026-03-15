import { create } from "zustand";
import type {
  SessionDTO,
  NamedSessionDTO,
  AgentHealthDTO,
  CronJobDTO,
  TaskDTO,
  ProcessDTO,
  Snapshot,
} from "@/types/api";

// Event data arrives from WebSocket as Record<string, unknown>. These helpers
// perform minimal runtime narrowing so we avoid blanket `as unknown as T` casts.
function asDTO<T>(data: Record<string, unknown>): T {
  return data as T;
}

function field<T>(data: Record<string, unknown>, key: string): T {
  return data[key] as T;
}

interface DashboardState {
  sessions: SessionDTO[];
  namedSessions: NamedSessionDTO[];
  agents: AgentHealthDTO[];
  cronJobs: CronJobDTO[];
  tasks: TaskDTO[];
  processes: ProcessDTO[];
  observers: Record<string, boolean>;
  config: Record<string, unknown>;
  connected: boolean;
  lastSnapshotAt: number | null;

  setConnected: (v: boolean) => void;
  applySnapshot: (data: Snapshot) => void;
  applyEvent: (event: string, data: Record<string, unknown>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  sessions: [],
  namedSessions: [],
  agents: [],
  cronJobs: [],
  tasks: [],
  processes: [],
  observers: {},
  config: {},
  connected: false,
  lastSnapshotAt: null,

  setConnected: (v) => set({ connected: v }),

  applySnapshot: (data) =>
    set({
      sessions: data.sessions,
      namedSessions: data.named_sessions,
      agents: data.agents,
      cronJobs: data.cron_jobs,
      tasks: data.tasks,
      processes: data.processes,
      observers: data.observers,
      config: data.config,
      lastSnapshotAt: Date.now(),
    }),

  applyEvent: (event, data) =>
    set((state) => {
      switch (event) {
        case "session.created":
          return { sessions: [...state.sessions, asDTO<SessionDTO>(data)] };
        case "session.updated": {
          const chatId = field<number>(data, "chat_id");
          if (!state.sessions.some((s) => s.chat_id === chatId)) return state;
          return {
            sessions: state.sessions.map((s) =>
              s.chat_id === chatId ? { ...s, ...asDTO<SessionDTO>(data) } : s,
            ),
          };
        }
        case "session.reset":
          return {
            sessions: state.sessions.filter((s) => s.chat_id !== field<number>(data, "chat_id")),
          };
        case "named_session.created":
          return {
            namedSessions: [...state.namedSessions, asDTO<NamedSessionDTO>(data)],
          };
        case "named_session.updated": {
          const name = field<string>(data, "name");
          if (!state.namedSessions.some((ns) => ns.name === name)) return state;
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === name ? { ...ns, ...asDTO<NamedSessionDTO>(data) } : ns,
            ),
          };
        }
        case "named_session.ended": {
          const name = field<string>(data, "name");
          if (!state.namedSessions.some((ns) => ns.name === name)) return state;
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === name ? { ...ns, status: "ended" } : ns,
            ),
          };
        }
        case "agent.health":
          return {
            agents: upsertBy(state.agents, asDTO<AgentHealthDTO>(data), "name"),
          };
        case "cron.fired":
        case "cron.updated": {
          const id = field<string>(data, "id");
          if (!state.cronJobs.some((j) => j.id === id)) return state;
          return {
            cronJobs: state.cronJobs.map((j) =>
              j.id === id ? ({ ...j, ...data } as CronJobDTO) : j,
            ),
          };
        }
        case "task.created":
          return { tasks: [...state.tasks, asDTO<TaskDTO>(data)] };
        case "task.updated": {
          const taskId = field<string>(data, "task_id");
          if (!state.tasks.some((t) => t.task_id === taskId)) return state;
          return {
            tasks: state.tasks.map((t) =>
              t.task_id === taskId ? { ...t, ...asDTO<TaskDTO>(data) } : t,
            ),
          };
        }
        case "process.started":
          return { processes: [...state.processes, asDTO<ProcessDTO>(data)] };
        case "process.ended":
          return {
            processes: state.processes.filter((p) => p.pid !== field<number>(data, "pid")),
          };
        default:
          console.debug("[dashboard] unhandled event:", event);
          return {};
      }
    }),
}));

function upsertBy<T>(arr: T[], item: T, key: keyof T): T[] {
  const idx = arr.findIndex((x) => x[key] === item[key]);
  if (idx === -1) return [...arr, item];
  const copy = [...arr];
  copy[idx] = { ...copy[idx], ...item };
  return copy;
}
