import { useCallback, useEffect, useState } from "react";
import { HabitSheet } from "./components/HabitSheet";
import { Glyph, Notice } from "./components/ui";
import { api, ApiError } from "./lib/api";
import { applyTheme, readTheme, type Theme } from "./lib/theme";
import type {
  EntryPayload,
  Habit,
  HabitDetail as Detail,
  HabitPayload,
  InsightsView,
  Reason,
  SessionState,
  TodayView,
} from "./lib/types";
import { Auth } from "./screens/Auth";
import { HabitDetail } from "./screens/HabitDetail";
import { Insights } from "./screens/Insights";
import { Settings } from "./screens/Settings";
import { Today } from "./screens/Today";

type Tab = "today" | "patterns" | "settings";

/* Routing is three tabs plus a habit detail, which is small enough that the
 * History API used directly beats a router dependency. The path is real, so the
 * back gesture and a reloaded PWA both land where you were. */
interface Route {
  tab: Tab;
  habitId: number | null;
}

function parseRoute(path: string): Route {
  const match = /^\/habit\/(\d+)$/.exec(path);
  if (match?.[1]) return { tab: "today", habitId: Number(match[1]) };
  if (path.startsWith("/patterns")) return { tab: "patterns", habitId: null };
  if (path.startsWith("/settings")) return { tab: "settings", habitId: null };
  return { tab: "today", habitId: null };
}

function routePath(route: Route): string {
  if (route.habitId !== null) return `/habit/${route.habitId}`;
  return route.tab === "today" ? "/" : `/${route.tab}`;
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [theme, setTheme] = useState<Theme>(readTheme);

  const [today, setToday] = useState<TodayView | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [insights, setInsights] = useState<InsightsView | null>(null);
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [months, setMonths] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [addingHabit, setAddingHabit] = useState(false);

  useEffect(() => applyTheme(theme), [theme]);

  // A browser back or forward gesture has to move the app, not the document.
  useEffect(() => {
    function onPop() {
      setRoute(parseRoute(window.location.pathname));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Route, replace = false) => {
    const path = routePath(next);
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setRoute(next);
  }, []);

  /* Any 401 means the session went away — it expired, or the password was
   * changed on another device. Drop straight back to the sign-in screen rather
   * than showing a wall of failed requests. */
  const guard = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await work();
      setError(null);
      return result;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSession({ initialised: true, signed_in: false, username: null });
        return undefined;
      }
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      return undefined;
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      setSession(await api.sessionState());
    } catch {
      setError("Cannot reach the server.");
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const refreshToday = useCallback(async () => {
    const view = await guard(() => api.today());
    if (view) {
      setToday(view);
      setReasons(view.reasons);
    }
  }, [guard]);

  const refreshDetail = useCallback(
    async (habitId: number) => {
      const view = await guard(() => api.habit(habitId));
      if (view) setDetail(view);
    },
    [guard],
  );

  const refreshInsights = useCallback(async () => {
    const view = await guard(() => api.insights(months));
    if (view) setInsights(view);
  }, [guard, months]);

  const refreshHabits = useCallback(async () => {
    const list = await guard(() => api.habits());
    if (list) setHabits(list);
    const tags = await guard(() => api.reasons());
    if (tags) setReasons(tags);
  }, [guard]);

  // Each screen loads what it needs when it is shown, so switching tabs always
  // shows current figures without a global store.
  useEffect(() => {
    if (!session?.signed_in) return;
    if (route.habitId !== null) {
      setDetail(null);
      void refreshDetail(route.habitId);
      return;
    }
    if (route.tab === "today") void refreshToday();
    if (route.tab === "patterns") void refreshInsights();
    if (route.tab === "settings") void refreshHabits();
  }, [session?.signed_in, route, refreshDetail, refreshToday, refreshInsights, refreshHabits]);

  async function logEntry(habitId: number, payload: EntryPayload) {
    await api.logEntry(habitId, payload);
  }

  async function unlogEntry(habitId: number, date: string) {
    await api.unlogEntry(habitId, date);
  }

  async function afterHabitChange() {
    await refreshHabits();
    await refreshToday();
    if (route.habitId !== null) await refreshDetail(route.habitId);
  }

  async function moveHabit(habitId: number, direction: -1 | 1) {
    if (!habits) return;
    const active = habits.filter((habit) => !habit.archived);
    const index = active.findIndex((habit) => habit.id === habitId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return;
    const reordered = [...active];
    const [moved] = reordered.splice(index, 1);
    if (moved) reordered.splice(target, 0, moved);
    await guard(() => api.reorderHabits(reordered.map((habit) => habit.id)));
    await refreshHabits();
  }

  if (!session) {
    return (
      <div className="boot">
        {error ? <Notice>{error}</Notice> : <span className="sr">Loading</span>}
      </div>
    );
  }

  if (!session.signed_in) {
    return (
      <Auth
        initialised={session.initialised}
        onSignIn={async (username, password) => {
          await api.login(username, password);
          await loadSession();
        }}
        onSetUp={async (username, password) => {
          await api.setup(username, password);
          await loadSession();
        }}
      />
    );
  }

  /* Keyed so that every move between screens remounts the wrapper and replays
   * its entrance. The animation touches opacity only: a transform here would
   * make this element the containing block for the sheets rendered inside it,
   * and a bottom sheet would stop being pinned to the bottom of the window. */
  const screenKey = route.habitId !== null ? `habit-${route.habitId}` : route.tab;

  return (
    <div className="app">
      <main className="app__main">
        <div className="screen" key={screenKey}>
        {route.habitId !== null ? (
          <HabitDetail
            detail={detail}
            error={error}
            today={today?.date ?? new Date().toISOString().slice(0, 10)}
            onBack={() => navigate({ tab: "today", habitId: null })}
            onEdit={() => setEditingHabit(detail)}
            onRefresh={() => refreshDetail(route.habitId!)}
            onLog={logEntry}
            onUnlog={unlogEntry}
          />
        ) : route.tab === "today" ? (
          <Today
            view={today}
            error={error}
            onRefresh={refreshToday}
            onOpenHabit={(id) => navigate({ tab: "today", habitId: id })}
            onAddHabit={() => setAddingHabit(true)}
            onLog={logEntry}
            onUnlog={unlogEntry}
          />
        ) : route.tab === "patterns" ? (
          <Insights
            view={insights}
            error={error}
            months={months}
            onMonthsChange={setMonths}
          />
        ) : (
          <Settings
            habits={habits}
            reasons={reasons}
            username={session.username}
            theme={theme}
            error={error}
            onThemeChange={setTheme}
            onEditHabit={setEditingHabit}
            onAddHabit={() => setAddingHabit(true)}
            onMoveHabit={moveHabit}
            onAddReason={async (label) => {
              await guard(() => api.createReason(label));
              await refreshHabits();
            }}
            onDeleteReason={async (id) => {
              await guard(() => api.deleteReason(id));
              await refreshHabits();
            }}
            onChangePassword={async (current, next) => {
              await api.changePassword(current, next);
            }}
            onLogout={async () => {
              await api.logout();
              setToday(null);
              setHabits(null);
              setInsights(null);
              await loadSession();
            }}
          />
        )}
        </div>
      </main>

      <nav className="tabs" aria-label="Sections">
        <TabButton
          label="Today"
          glyph="today"
          active={route.tab === "today"}
          onClick={() => navigate({ tab: "today", habitId: null })}
        />
        <TabButton
          label="Patterns"
          glyph="chart"
          active={route.tab === "patterns"}
          onClick={() => navigate({ tab: "patterns", habitId: null })}
        />
        <TabButton
          label="Settings"
          glyph="gear"
          active={route.tab === "settings"}
          onClick={() => navigate({ tab: "settings", habitId: null })}
        />
      </nav>

      {addingHabit ? (
        <HabitSheet
          habit={null}
          onSave={async (payload: HabitPayload) => {
            await api.createHabit(payload);
            await afterHabitChange();
          }}
          onClose={() => setAddingHabit(false)}
        />
      ) : null}

      {editingHabit ? (
        <HabitSheet
          habit={editingHabit}
          onSave={async (payload) => {
            await api.updateHabit(editingHabit.id, payload);
            await afterHabitChange();
          }}
          onArchive={async (archived) => {
            await api.updateHabit(editingHabit.id, { archived });
            await afterHabitChange();
          }}
          onDelete={async () => {
            await api.deleteHabit(editingHabit.id);
            // The detail screen for a deleted habit no longer exists.
            if (route.habitId === editingHabit.id) {
              navigate({ tab: "today", habitId: null }, true);
            }
            await afterHabitChange();
          }}
          onClose={() => setEditingHabit(null)}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: "today" | "chart" | "gear";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tabs__tab${active ? " is-on" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Glyph name={glyph} />
      <span>{label}</span>
    </button>
  );
}
