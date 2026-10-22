/* Patterns across habits.
 *
 * Three questions, in the order they are useful: when does this happen, what is
 * going on when it does, and is it getting better or worse. Each is a small bar
 * chart drawn with divs rather than a charting library — the shapes are simple
 * enough that a dependency would cost more than it saves, and plain elements
 * keep every bar reachable by a screen reader.
 */

import { useState } from "react";
import { Mark, Notice, Segmented, Spinner } from "../components/ui";
import { formatMonth, percent, WEEKDAYS } from "../lib/format";
import { habitStyle } from "../lib/palette";
import type { InsightHabit, InsightsView } from "../lib/types";

const SCALE_FLOOR = 4;

interface InsightsProps {
  view: InsightsView | null;
  error: string | null;
  months: number;
  onMonthsChange: (months: number) => void;
}

export function Insights({ view, error, months, onMonthsChange }: InsightsProps) {
  const [only, setOnly] = useState<"all" | "negative" | "positive">("all");

  if (error) return <Notice>{error}</Notice>;
  if (!view) return <Spinner label="Loading insights" />;

  const habits = view.habits.filter((habit) => only === "all" || habit.kind === only);

  return (
    <>
      <header className="screen__head">
        <p className="marker">last {months} months</p>
        <h1 className="screen__title">Patterns</h1>
      </header>

      <div className="toolbar">
        <Segmented
          ariaLabel="Which habits to show"
          value={only}
          onChange={setOnly}
          options={[
            { value: "all", label: "All" },
            { value: "negative", label: "Avoiding" },
            { value: "positive", label: "Keeping up" },
          ]}
        />
        <Segmented
          ariaLabel="How far back"
          value={String(months)}
          onChange={(value) => onMonthsChange(Number(value))}
          options={[
            { value: "3", label: "3m" },
            { value: "12", label: "12m" },
            { value: "24", label: "24m" },
          ]}
        />
      </div>

      {habits.length === 0 ? (
        <p className="panel__foot">Nothing to show yet.</p>
      ) : (
        habits.map((habit) => <HabitInsight key={habit.id} habit={habit} />)
      )}
    </>
  );
}

function HabitInsight({ habit }: { habit: InsightHabit }) {
  const negative = habit.kind === "negative";
  // A floor on the scale, so two slips in a year do not draw a full-height bar.
  // Without it a handful of entries renders as a wall of colour that overstates
  // what happened — the opposite of what this screen is for.
  const weekdayMax = Math.max(...habit.weekday, SCALE_FLOOR);
  const monthMax = Math.max(...habit.monthly.map((month) => month.count), SCALE_FLOOR);
  const reasonMax = Math.max(...(habit.reasons ?? []).map((reason) => reason.count), SCALE_FLOOR);
  const totalLogged = habit.weekday.reduce((sum, count) => sum + count, 0);

  return (
    <section className="panel tinted" style={habitStyle(habit)}>
      <div className="panel__head">
        <h2 className="panel__title">
          <Mark habit={habit} size="sm" /> {habit.name}
        </h2>
        <span className="label">
          {percent(habit.summary.success_rate)} kept, {habit.summary.current_streak} day run
        </span>
      </div>

      {totalLogged === 0 ? (
        <p className="panel__foot">
          {negative
            ? "No slips in this window. Nothing to find a pattern in, which is the point."
            : "Nothing logged in this window."}
        </p>
      ) : (
        <>
          <h3 className="chart__title label">
            {negative ? "Which day slips happen on" : "Which day it gets done"}
          </h3>
          <div className="chart chart--weekday">
            {habit.weekday.map((count, index) => (
              <div className="chart__col" key={WEEKDAYS[index]}>
                <div className="chart__track">
                  {count > 0 ? (
                    <div
                      className={`chart__bar${negative ? " chart__bar--slip" : ""}`}
                      style={{ height: `${(count / weekdayMax) * 100}%` }}
                    />
                  ) : null}
                </div>
                <span className="chart__tick">{WEEKDAYS[index]?.charAt(0)}</span>
                <span className="sr">
                  {WEEKDAYS[index]}: {count}
                </span>
                <span className="chart__value">{count}</span>
              </div>
            ))}
          </div>

          {negative && habit.reasons && habit.reasons.length > 0 ? (
            <>
              <h3 className="chart__title label">What was going on</h3>
              <ul className="bars">
                {habit.reasons.map((reason) => (
                  <li className="bars__row" key={reason.reason}>
                    <span className="bars__label">{reason.reason}</span>
                    <span className="bars__track">
                      <span
                        className="bars__fill"
                        style={{ width: `${(reason.count / reasonMax) * 100}%` }}
                      />
                    </span>
                    <span className="bars__value">{reason.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {negative && habit.planned_split && habit.allows_planned ? (
            <p className="panel__foot">
              {habit.planned_split.unplanned} unplanned,{" "}
              {habit.planned_split.planned} planned. Planned exceptions do not break a run.
            </p>
          ) : null}

          <h3 className="chart__title label">
            {negative ? "Slips by month" : "Days done by month"}
          </h3>
          <div className="chart chart--month">
            {habit.monthly.map((month) => (
              <div className="chart__col" key={month.month}>
                <div className="chart__track">
                  {month.count > 0 ? (
                    <div
                      className={`chart__bar${negative ? " chart__bar--slip" : ""}`}
                      style={{ height: `${(month.count / monthMax) * 100}%` }}
                    />
                  ) : null}
                </div>
                <span className="chart__tick">{formatMonth(month.month).charAt(0)}</span>
                <span className="sr">
                  {formatMonth(month.month)} {month.month.slice(0, 4)}: {month.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
