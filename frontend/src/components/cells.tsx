/* The day cell, and the two things built from it.
 *
 * One primitive at two scales holds the app together: a tappable 7-day strip on
 * the Today screen, and a year of the same cells on the detail screen. Learning
 * to read one teaches you the other.
 */

import { useEffect, useRef } from "react";
import { describeState, formatFullDay, fromIso, WEEKDAYS } from "../lib/format";
import type { DayState, HeatmapCell, WeekCell } from "../lib/types";

interface DayCellProps {
  date: string;
  state: DayState;
  size?: number;
  title?: string;
  onClick?: () => void;
}

export function DayCell({ date, state, size, title, onClick }: DayCellProps) {
  const style = size ? { width: size, height: size } : undefined;
  const label = `${formatFullDay(date)}: ${describeState(state)}`;
  const className = `cell cell--${state}`;

  if (!onClick) {
    return (
      <span className={className} style={style} title={title ?? label} role="img" aria-label={label} />
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      title={title ?? label}
      onClick={onClick}
      aria-label={label}
    />
  );
}

interface WeekStripProps {
  cells: WeekCell[];
  onPick: (date: string) => void;
}

/** The current week, Monday first, every day tappable.
 *
 * This is the reason the Today screen is enough on its own most days: a day
 * forgotten yesterday can be filled in without leaving the first screen.
 */
export function WeekStrip({ cells, onPick }: WeekStripProps) {
  return (
    <div className="strip" role="group" aria-label="This week">
      {cells.map((cell) => {
        const weekday = WEEKDAYS[(fromIso(cell.date).getDay() + 6) % 7] ?? "";
        return (
          <div className="strip__day" key={cell.date}>
            <span className="strip__letter" aria-hidden="true">
              {weekday.charAt(0)}
            </span>
            <DayCell
              date={cell.date}
              state={cell.state}
              onClick={cell.state === "untracked" ? undefined : () => onPick(cell.date)}
            />
          </div>
        );
      })}
    </div>
  );
}

interface HeatmapProps {
  cells: HeatmapCell[];
  onPick?: (date: string) => void;
}

/** A year of days in columns of seven, oldest on the left.
 *
 * The backend aligns the window to a Monday, so every column is a whole week
 * and a simple wrapping grid lands the weekdays in consistent rows.
 */
export function Heatmap({ cells, onPick }: HeatmapProps) {
  const monthMarks = monthBoundaries(cells);
  const scroller = useRef<HTMLDivElement>(null);

  // A year of days is wider than a phone, and the interesting end is the recent
  // one, so open scrolled to today rather than to twelve months ago.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [cells]);

  return (
    <div className="heatmap">
      <div className="heatmap__weekdays" aria-hidden="true">
        {WEEKDAYS.map((day, index) => (
          // Mon, Wed and Fri only: seven labels at this size become noise.
          <span key={day}>{index % 2 === 0 ? day.charAt(0) : ""}</span>
        ))}
      </div>
      <div className="heatmap__scroll" ref={scroller}>
        <div className="heatmap__months" aria-hidden="true">
          {monthMarks.map((mark) => (
            <span key={mark.key} style={{ gridColumn: `${mark.column} / span ${mark.span}` }}>
              {mark.label}
            </span>
          ))}
        </div>
        <div className="heatmap__grid">
          {cells.map((cell) => (
            <DayCell
              key={cell.date}
              date={cell.date}
              state={cell.state}
              onClick={
                onPick && cell.state !== "untracked" ? () => onPick(cell.date) : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface MonthMark {
  key: string;
  label: string;
  column: number;
  span: number;
}

/** Column spans for the month labels above the grid.
 *
 * A month gets a label only when it owns at least two columns, so short
 * leading and trailing months do not collide with their neighbours.
 */
function monthBoundaries(cells: HeatmapCell[]): MonthMark[] {
  const columns: { month: number; year: number }[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const cell = cells[index];
    if (!cell) break;
    const date = fromIso(cell.date);
    columns.push({ month: date.getMonth(), year: date.getFullYear() });
  }

  const marks: MonthMark[] = [];
  let start = 0;
  for (let index = 1; index <= columns.length; index += 1) {
    const current = columns[index];
    const previous = columns[start];
    if (!previous) break;
    const changed =
      !current || current.month !== previous.month || current.year !== previous.year;
    if (!changed) continue;
    const span = index - start;
    if (span >= 2) {
      marks.push({
        key: `${previous.year}-${previous.month}`,
        label: MONTH_LABELS[previous.month] ?? "",
        column: start + 1,
        span,
      });
    }
    start = index;
  }
  return marks;
}

/** The key to the cell colours. Shown once per screen, not per habit. */
export function CellLegend({ kind }: { kind: "positive" | "negative" }) {
  const states: DayState[] =
    kind === "negative" ? ["clean", "planned", "slip"] : ["done", "missed"];
  return (
    <div className="legend">
      {states.map((state) => (
        <span className="legend__item" key={state}>
          <span className={`cell cell--${state}`} aria-hidden="true" />
          {describeState(state)}
        </span>
      ))}
    </div>
  );
}
