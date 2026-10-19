import type {
  Entry,
  EntryPayload,
  Habit,
  HabitDetail,
  HabitPayload,
  InsightsView,
  Reason,
  SessionState,
  TodayView,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)track_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-Track-CSRF"] = csrfToken();

  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      // FastAPI returns a string for a raised HTTPException and a list of field
      // errors for a validation failure; both should read as one sentence.
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((d: { msg?: string }) => d.msg ?? "")
          .filter(Boolean)
          .join("; ");
      }
    } catch {
      /* A non-JSON error body leaves the status text in place. */
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export const api = {
  sessionState: () => request<SessionState>("/api/session/state"),

  setup: (username: string, password: string) =>
    request<{ ok: true }>("/api/session/setup", {
      method: "POST",
      body: { username, password },
    }),

  login: (username: string, password: string) =>
    request<{ ok: true }>("/api/session/login", {
      method: "POST",
      body: { username, password },
    }),

  logout: () => request<{ ok: true }>("/api/session/logout", { method: "POST" }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/session/password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  today: () => request<TodayView>("/api/today"),

  habits: () => request<Habit[]>("/api/habits"),

  habit: (id: number) => request<HabitDetail>(`/api/habits/${id}`),

  createHabit: (payload: HabitPayload) =>
    request<Habit>("/api/habits", { method: "POST", body: payload }),

  updateHabit: (id: number, patch: Partial<HabitPayload> & { archived?: boolean }) =>
    request<Habit>(`/api/habits/${id}`, { method: "PATCH", body: patch }),

  deleteHabit: (id: number) =>
    request<void>(`/api/habits/${id}`, { method: "DELETE" }),

  reorderHabits: (habitIds: number[]) =>
    request<{ ok: true }>("/api/habits/reorder", {
      method: "POST",
      body: { habit_ids: habitIds },
    }),

  logEntry: (habitId: number, payload: EntryPayload) =>
    request<Entry>(`/api/habits/${habitId}/entries`, { method: "PUT", body: payload }),

  unlogEntry: (habitId: number, date: string) =>
    request<void>(`/api/habits/${habitId}/entries/${date}`, { method: "DELETE" }),

  insights: (months = 12) => request<InsightsView>(`/api/insights?months=${months}`),

  reasons: () => request<Reason[]>("/api/reasons"),

  createReason: (label: string) =>
    request<Reason>("/api/reasons", { method: "POST", body: { label } }),

  deleteReason: (id: number) =>
    request<void>(`/api/reasons/${id}`, { method: "DELETE" }),
};
