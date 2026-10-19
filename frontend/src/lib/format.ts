import type { DayState, Habit, Summary } from "./types";

/** Today in the browser's own timezone, as YYYY-MM-DD. */
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD as a local date, never UTC.
 *
 * `new Date("2026-10-19")` is parsed as UTC midnight, which lands on the 18th
 * for anyone west of Greenwich and shifts the whole calendar by a day. Passing
 * the parts separately avoids it.
 */
export function fromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDays(value: string, delta: number): string {
  const date = fromIso(value);
  date.setDate(date.getDate() + delta);
  return toIso(date);
}

export function daysBetween(from: string, to: string): number {
  const ms = fromIso(to).getTime() - fromIso(from).getTime();
  return Math.round(ms / 86_400_000);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDay(iso: string): string {
  const date = fromIso(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatFullDay(iso: string): string {
  const date = fromIso(iso);
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatMonth(key: string): string {
  const [, month] = key.split("-").map(Number);
  return MONTHS[(month ?? 1) - 1] ?? key;
}

/** "today", "yesterday", or a date. Used where a day is named on its own. */
export function relativeDay(iso: string, today = todayIso()): string {
  const delta = daysBetween(iso, today);
  if (delta === 0) return "today";
  if (delta === 1) return "yesterday";
  if (delta < 7) return `${delta} days ago`;
  return formatDay(iso);
}

/** Always relative, never a date.
 *
 * For use beside a date that is already spelled out, where relativeDay's
 * fallback would simply repeat it ("Wed 15 Jul 2026, 15 Jul").
 */
export function daysAgo(iso: string, today = todayIso()): string {
  const delta = daysBetween(iso, today);
  if (delta === 0) return "today";
  if (delta === 1) return "yesterday";
  return `${delta} days ago`;
}

/** A duration in the largest unit that still reads honestly.
 *
 * Months are the point at which a day count stops being legible: 400 days is a
 * number you have to work out, "1 year 1 month" is not. Below 60 days the day
 * count is the more motivating figure, so it stays.
 */
export function describeDuration(days: number): string {
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0) return `${Math.floor(days / 30)} months`;
  if (months === 0) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years}y ${months}m`;
}

export function percent(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/** The word for a habit's current run, which differs by kind. */
export function streakNoun(habit: Habit): string {
  return habit.kind === "negative" ? "clean" : "in a row";
}

/** What the primary action on a card does, in the user's own terms. */
export function logVerb(habit: Habit, summary: Summary): string {
  if (habit.kind === "negative") {
    return summary.logged_today ? "Logged today" : "Log a slip";
  }
  return summary.logged_today ? "Done today" : "Mark done";
}

const STATE_WORDS: Record<DayState, string> = {
  clean: "clean",
  planned: "planned exception",
  slip: "slipped",
  done: "done",
  missed: "not done",
  untracked: "not tracked",
};

export function describeState(state: DayState): string {
  return STATE_WORDS[state];
}

export function accentVar(accent: string): string {
  return `var(--accent-${accent})`;
}

/** A unit matched to its amount: "1 cigarette", "2 cigarettes".
 *
 * Units are free text typed by the user, so this only drops a trailing "s" for
 * a quantity of one. It is wrong for an irregular plural, which is a fair trade
 * against asking for two spellings of every unit.
 */
export function withUnit(amount: number, unit: string | null): string {
  const figure = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  if (!unit) return figure;
  const word = amount === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return `${figure} ${word}`;
}
