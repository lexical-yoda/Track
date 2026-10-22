export type Kind = "positive" | "negative";

export type DayState =
  | "clean"
  | "planned"
  | "slip"
  | "done"
  | "missed"
  | "untracked";

export interface Habit {
  id: number;
  name: string;
  kind: Kind;
  /** The symbol shown on the habit: an emoji, a character, or "" for none. */
  icon: string;
  /** The habit's own colour, as #RRGGBB. */
  color: string;
  start_date: string;
  target_per_week: number | null;
  allows_planned: boolean;
  unit: string | null;
  notes: string | null;
  sort_order: number;
  archived: boolean;
}

export interface Entry {
  id: number;
  habit_id: number;
  date: string;
  amount: number | null;
  note: string | null;
  reason_id: number | null;
  reason: string | null;
  planned: boolean;
}

export interface WeekProgress {
  week_start: string;
  done: number;
  target: number;
  on_track: boolean;
}

export interface Summary {
  habit_id: number;
  current_streak: number;
  longest_streak: number;
  logged_today: boolean;
  today_planned: boolean;
  tracked_days: number;
  kept_days: number;
  slip_days?: number;
  planned_days?: number;
  missed_days?: number;
  success_rate: number | null;
  amount_total: number | null;
  week?: WeekProgress;
  weeks_on_target?: number;
  last_slip?: string | null;
}

export interface HabitCard extends Habit {
  summary: Summary;
  today_entry: Entry | null;
  /** The seven cells of the current week, Monday first, from the server. */
  week: WeekCell[];
  recent: Entry[];
}

export interface HeatmapCell {
  date: string;
  state: DayState;
  amount: number | null;
}

/** A heatmap cell that also carries its entry, as the Today week strip does. */
export interface WeekCell extends HeatmapCell {
  entry: Entry | null;
}

export interface HabitDetail extends Habit {
  summary: Summary;
  heatmap: HeatmapCell[];
  milestones: { passed: number[]; next: number | null };
  entries: Entry[];
  reasons: Reason[];
}

export interface Reason {
  id: number;
  label: string;
}

export interface TodayView {
  date: string;
  habits: HabitCard[];
  reasons: Reason[];
}

export interface InsightHabit extends Habit {
  summary: Summary;
  weekday: number[];
  monthly: { month: string; count: number }[];
  reasons?: { reason: string; count: number }[];
  planned_split?: { planned: number; unplanned: number };
}

export interface InsightsView {
  date: string;
  months: number;
  habits: InsightHabit[];
}

export interface SessionState {
  initialised: boolean;
  signed_in: boolean;
  username: string | null;
}

export interface EntryPayload {
  date: string;
  amount?: number | null;
  note?: string | null;
  reason_id?: number | null;
  planned?: boolean;
}

export interface HabitPayload {
  name: string;
  kind: Kind;
  icon: string;
  color: string;
  start_date: string;
  target_per_week?: number | null;
  allows_planned?: boolean;
  unit?: string | null;
  notes?: string | null;
}
