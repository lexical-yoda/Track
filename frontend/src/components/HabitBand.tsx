/* One habit on the Today screen.
 *
 * A full-width band rather than a card in a grid: the figure needs room to be
 * the largest thing on the row, and the week strip needs seven cells side by
 * side at a comfortable tap size. On a phone the bands stack; on a desktop they
 * stay bands and simply get wider, so the two layouts are the same design.
 */

import type { CSSProperties } from "react";
import { describeDuration, percent } from "../lib/format";
import type { HabitCard } from "../lib/types";
import { WeekStrip } from "./cells";

interface HabitBandProps {
  card: HabitCard;
  today: string;
  onOpen: () => void;
  onPickDay: (date: string) => void;
}

export function HabitBand({ card, today, onOpen, onPickDay }: HabitBandProps) {
  const { summary } = card;
  const negative = card.kind === "negative";

  return (
    <article
      className="band"
      style={{ "--accent": `var(--accent-${card.accent})` } as CSSProperties}
    >
      <button type="button" className="band__head" onClick={onOpen}>
        <span className="band__name">{card.name}</span>
        <span className="band__kind label">
          {negative
            ? "avoiding"
            : card.target_per_week
              ? `${card.target_per_week}× a week`
              : "daily"}
        </span>
      </button>

      <div className="band__body">
        <div className="band__figure">
          <span className="figure band__count">{summary.current_streak}</span>
          <span className="band__unit label">
            {negative
              ? "days clean"
              : summary.current_streak === 1
                ? "day in a row"
                : "days in a row"}
          </span>
        </div>

        <div className="band__week">
          <WeekStrip cells={card.week} onPick={onPickDay} />
        </div>
      </div>

      <dl className="band__meta">
        <div>
          <dt className="label">Best</dt>
          <dd>{describeDuration(summary.longest_streak)}</dd>
        </div>
        <div>
          <dt className="label">{negative ? "Kept" : "Done"}</dt>
          <dd>
            {summary.kept_days} of {summary.tracked_days}
          </dd>
        </div>
        <div>
          <dt className="label">Rate</dt>
          <dd>{percent(summary.success_rate)}</dd>
        </div>
        {negative && summary.planned_days ? (
          <div>
            <dt className="label">Planned</dt>
            <dd>{summary.planned_days}</dd>
          </div>
        ) : null}
        {!negative && summary.week ? (
          <div>
            <dt className="label">This week</dt>
            <dd>
              {summary.week.done}/{summary.week.target}
            </dd>
          </div>
        ) : null}
      </dl>

      <button
        type="button"
        className={`band__action${summary.logged_today ? " is-logged" : ""}`}
        onClick={() => onPickDay(today)}
      >
        {logLabel(card)}
      </button>
    </article>
  );
}

function logLabel(card: HabitCard): string {
  const { summary, kind } = card;
  if (kind === "negative") {
    if (!summary.logged_today) return "Log a slip today";
    return summary.today_planned ? "Logged today — planned" : "Logged a slip today";
  }
  return summary.logged_today ? "Done today" : "Mark done today";
}
