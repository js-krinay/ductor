import { useAuthStore } from "@/store/auth";
import type { HistoryResponse, CronRunEntry } from "@/types/api";

function headers(): HeadersInit {
  const token = useAuthStore.getState().token;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: headers() });
  if (res.status === 401) {
    useAuthStore.getState().clearToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchHistory(
  chatId: number,
  opts?: { topicId?: number; limit?: number; before?: number; origin?: string },
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.topicId != null) params.set("topic_id", String(opts.topicId));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.before != null) params.set("before", String(opts.before));
  if (opts?.origin) params.set("origin", opts.origin);
  const qs = params.toString();
  return apiFetch<HistoryResponse>(`/api/sessions/${chatId}/history${qs ? `?${qs}` : ""}`);
}

export async function fetchCronHistory(jobId: string, limit = 20): Promise<{ runs: CronRunEntry[] }> {
  return apiFetch(`/api/cron/${encodeURIComponent(jobId)}/history?limit=${limit}`);
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<void> {
  await apiFetch(`/api/cron/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });
}

export async function abortChat(chatId: number): Promise<void> {
  await apiFetch("/api/abort", {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId }),
  });
}
