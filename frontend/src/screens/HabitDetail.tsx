import { useState } from "react";
import { CellLegend, Heatmap } from "../components/cells";
import { LogSheet } from "../components/LogSheet";
import { Button, Glyph, Mark, Notice, Spinner } from "../components/ui";
import {
  daysAgo,
  describeDuration,
  describeSpan,
  formatDay,
  formatFullDay,
  percent,
  spansAMonth,
  withUnit,
} from "../lib/format";
import { habitStyle } from "../lib/palette";
import type { Entry, EntryPayload, Habit, HabitDetail as Detail, Summary } from "../lib/types";

interface HabitDetailProps {
  detail: Detail | null;
  error: string | null;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
  onLog: (habitId: number, payload: EntryPayload) => Promise<void>;
  onUnlog: (habitId: number, date: string) => Promise<void>;
}

export function HabitDetail({
  detail,
  error,
  today,
  onBack,
  onEdit,
  onRefresh,
  onLog,
  onUnlog,
}: HabitDetailProps) {
  const [editing, setEditing] = useState<{ date: string; entry: Entry | null } | null>(null);

  if (error) return <Notice>{error}</Notice>;
  if (!detail) return <Spinner label="Loading habit" />;

  const { summary, milestones } = detail;
  const negative = detail.kind === "negative";
  const byDate = new Map(detail.entries.map((entry) => [entry.date, entry]));

  return (
    <div className="tinted" style={habitStyle(detail)}>
      <header className="screen__head screen__head--detail">
        <button type="button" className="iconbtn" onClick={onBack} aria-label="Back to today">
          <Glyph name="back" />
        </button>
        <Mark habit={detail} size="lg" />
        <div>
          <p className="marker">{negative ? "avoiding" : "keeping up"}</p>
          <h1 className="screen__title">{detail.name}</h1>
        </div>
        <button type="button" className="iconbtn" onClick={onEdit} aria-label="Edit habit">
          <Glyph name="gear" />
        </button>
      </header>

      <section className="counter">
        <span className="figure counter__value">{summary.current_streak}</span>
        <p className="counter__unit">
          {negative ? "days clean" : "days in a row"}
          {/* Past a month the day count stops being a length you can picture.
              The breakdown is carried beside it rather than instead of it,
              because the figure above is the one that ticks over each
              morning and is the reason to open the app. */}
          {spansAMonth(summary.current_streak, today) ? (
            <span className="counter__span">
              {describeSpan(summary.current_streak, today)}
            </span>
          ) : null}
        </p>
        {negative ? (
          <p className="counter__since">
            {summary.last_slip
              ? `Last slip ${formatFullDay(summary.last_slip)}, ${daysAgo(summary.last_slip, today)}.`
              : `Nothing logged since ${formatFullDay(detail.start_date)}.`}
          </p>
        ) : null}
        {milestones.next ? (
          <p className="counter__next">
            <span>{milestones.next - summary.current_streak} days to</span>
            <span className="counter__bar" aria-hidden="true">
              <span
                className="counter__fill"
                style={{ width: `${progressTo(summary.current_streak, milestones)}%` }}
              />
            </span>
            <span className="figure counter__target">{milestones.next}</span>
          </p>
        ) : null}
      </section>

      <dl className="stats">
        <div>
          <dt className="label">Best run</dt>
          <dd className="figure stats__figure">{summary.longest_streak}</dd>
          <p className="stats__sub">{describeDuration(summary.longest_streak)}</p>
        </div>
        <div>
          <dt className="label">{negative ? "Days kept" : "Days done"}</dt>
          <dd className="figure stats__figure">{summary.kept_days}</dd>
          <p className="stats__sub">of {summary.tracked_days} tracked</p>
        </div>
        <div>
          <dt className="label">Rate</dt>
          <dd className="figure stats__figure">{percent(summary.success_rate)}</dd>
          <p className="stats__sub">
            {negative
              ? `${summary.slip_days ?? 0} slip${summary.slip_days === 1 ? "" : "s"}`
              : `${summary.missed_days ?? 0} missed`}
          </p>
        </div>
        {negative && (summary.planned_days ?? 0) > 0 ? (
          <div>
            <dt className="label">Planned</dt>
            <dd className="figure stats__figure">{summary.planned_days}</dd>
            <p className="stats__sub">accepted exceptions</p>
          </div>
        ) : null}
        {!negative && summary.weeks_on_target !== undefined ? (
          <div>
            <dt className="label">Weeks on target</dt>
            <dd className="figure stats__figure">{summary.weeks_on_target}</dd>
            <p className="stats__sub">
              {detail.target_per_week ?? 7}× a week
            </p>
          </div>
        ) : null}
        {summary.amount_total && detail.unit ? (
          <div>
            <dt className="label">Total {detail.unit}</dt>
            <dd className="figure stats__figure">{formatAmount(summary.amount_total)}</dd>
            <p className="stats__sub">logged</p>
          </div>
        ) : null}
      </dl>

      <section className="panel">
        <h2 className="panel__title">The year</h2>
        <Heatmap
          cells={detail.heatmap}
          onPick={(date) => setEditing({ date, entry: byDate.get(date) ?? null })}
        />
        <div className="panel__legend">
          <CellLegend kind={detail.kind} />
        </div>
        <p className="panel__foot">
          Tap any day to log it or change it. Days before {formatDay(detail.start_date)} are
          not tracked.
        </p>
      </section>

      {milestones.passed.length > 0 ? (
        <section className="panel">
          <h2 className="panel__title">Passed</h2>
          <div className="milestones">
            {milestones.passed.map((mark) => (
              <span className="milestone" key={mark}>
                {mark} {mark === 1 ? "day" : "days"}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">
            {negative
              ? detail.allows_planned
                ? "Slips and exceptions"
                : "Every slip"
              : "Every day logged"}
          </h2>
          <span className="label">{countLabel(detail.entries.length, negative)}</span>
        </div>
        {detail.entries.length === 0 ? (
          <p className="panel__foot">
            {negative
              ? `Nothing logged since ${formatDay(detail.start_date)}.`
              : "Nothing logged yet."}
          </p>
        ) : (
          <ul className="log">
            {detail.entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`log__row log__row--${entryTone(entry, negative)}`}
                  onClick={() => setEditing({ date: entry.date, entry })}
                >
                  <span className="log__date">{formatFullDay(entry.date)}</span>
                  <span className="log__tags">
                    {entry.planned ? <span className="tag tag--planned">planned</span> : null}
                    {entry.reason ? <span className="tag">{entry.reason}</span> : null}
                    {entry.amount != null ? (
                      <span className="tag tag--amount">
                        {withUnit(entry.amount, detail.unit)}
                      </span>
                    ) : null}
                  </span>
                  {entry.note ? <span className="log__note">{entry.note}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.notes ? (
        <section className="panel">
          <h2 className="panel__title">Why</h2>
          <p className="panel__prose">{detail.notes}</p>
        </section>
      ) : null}

      <div className="screen__foot">
        <Button variant="solid" onClick={() => setEditing({ date: today, entry: byDate.get(today) ?? null })} full>
          {footLabel(detail.kind, summary)}
        </Button>
      </div>

      {editing ? (
        <LogSheet
          habit={detail}
          date={editing.date}
          existing={editing.entry}
          reasons={detail.reasons}
          onSave={async (payload) => {
            await onLog(detail.id, payload);
            await onRefresh();
          }}
          onRemove={async () => {
            await onUnlog(detail.id, editing.date);
            await onRefresh();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** How far the current run has come between the last milestone and the next. */
function progressTo(streak: number, milestones: { passed: number[]; next: number | null }): number {
  if (!milestones.next) return 100;
  const from = milestones.passed.at(-1) ?? 0;
  const span = milestones.next - from;
  if (span <= 0) return 100;
  return Math.max(2, Math.min(100, ((streak - from) / span) * 100));
}

/** What the button at the foot of the screen offers, given what today holds. */
function footLabel(kind: Habit["kind"], summary: Summary): string {
  if (kind === "negative") {
    if (!summary.logged_today) return "Log a slip today";
    return summary.today_planned
      ? "Change today's planned exception"
      : "Change today's slip";
  }
  return summary.logged_today ? "Change today's entry" : "Mark today done";
}

/** "9 recorded", or the singular, for the count beside a section heading. */
function countLabel(total: number, negative: boolean): string {
  if (total === 0) return negative ? "none yet" : "none yet";
  return `${total} ${total === 1 ? "day" : "days"} recorded`;
}

/** Which pigment a logged day is filed under, matching its cell in the grid. */
function entryTone(entry: Entry, negative: boolean): "slip" | "planned" | "done" {
  if (!negative) return "done";
  return entry.planned ? "planned" : "slip";
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
