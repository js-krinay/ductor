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

interface DashboardState {
  sessions: SessionDTO[];
  namedSessions: NamedSessionDTO[];
  agents: AgentHealthDTO[];
  cronJobs: CronJobDTO[];
  tasks: TaskDTO[];
  processes: ProcessDTO[];
  observers: Record<string, unknown>;
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
          return { sessions: [...state.sessions, data as unknown as SessionDTO] };
        case "session.updated":
          return {
            sessions: state.sessions.map((s) =>
              s.chat_id === (data as unknown as SessionDTO).chat_id
                ? { ...s, ...(data as unknown as SessionDTO) }
                : s,
            ),
          };
        case "session.reset":
          return {
            sessions: state.sessions.filter(
              (s) => s.chat_id !== (data as { chat_id: number }).chat_id,
            ),
          };
        case "named_session.created":
          return {
            namedSessions: [...state.namedSessions, data as unknown as NamedSessionDTO],
          };
        case "named_session.updated":
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === (data as unknown as NamedSessionDTO).name
                ? { ...ns, ...(data as unknown as NamedSessionDTO) }
                : ns,
            ),
          };
        case "named_session.ended":
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === (data as { name: string }).name
                ? { ...ns, status: "ended" }
                : ns,
            ),
          };
        case "agent.health":
          return {
            agents: upsertBy(state.agents, data as unknown as AgentHealthDTO, "name"),
          };
        case "cron.fired":
        case "cron.updated":
          return {
            cronJobs: state.cronJobs.map((j) =>
              j.id === (data as { id: string }).id ? { ...j, ...data } as CronJobDTO : j,
            ),
          };
        case "task.created":
          return { tasks: [...state.tasks, data as unknown as TaskDTO] };
        case "task.updated":
          return {
            tasks: state.tasks.map((t) =>
              t.task_id === (data as unknown as TaskDTO).task_id
                ? { ...t, ...(data as unknown as TaskDTO) }
                : t,
            ),
          };
        case "process.started":
          return { processes: [...state.processes, data as unknown as ProcessDTO] };
        case "process.ended":
          return {
            processes: state.processes.filter(
              (p) => p.pid !== (data as { pid: number }).pid,
            ),
          };
        default:
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
