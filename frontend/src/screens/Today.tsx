import { useState } from "react";
import { HabitBand } from "../components/HabitBand";
import { LogSheet } from "../components/LogSheet";
import { Button, Notice, Spinner } from "../components/ui";
import { formatFullDay } from "../lib/format";
import type { Entry, EntryPayload, TodayView } from "../lib/types";

interface TodayProps {
  view: TodayView | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onOpenHabit: (id: number) => void;
  onAddHabit: () => void;
  onLog: (habitId: number, payload: EntryPayload) => Promise<void>;
  onUnlog: (habitId: number, date: string) => Promise<void>;
}

interface Editing {
  habitId: number;
  date: string;
  entry: Entry | null;
}

export function Today({
  view,
  error,
  onRefresh,
  onOpenHabit,
  onAddHabit,
  onLog,
  onUnlog,
}: TodayProps) {
  const [editing, setEditing] = useState<Editing | null>(null);

  if (error) return <Notice>{error}</Notice>;
  if (!view) return <Spinner label="Loading today" />;

  const editingHabit = editing
    ? view.habits.find((habit) => habit.id === editing.habitId)
    : undefined;

  const negatives = view.habits.filter((habit) => habit.kind === "negative");
  const positives = view.habits.filter((habit) => habit.kind === "positive");

  function pickDay(habitId: number, date: string) {
    const habit = view!.habits.find((candidate) => candidate.id === habitId);
    const cell = habit?.week.find((entry) => entry.date === date);
    setEditing({ habitId, date, entry: cell?.entry ?? null });
  }

  return (
    <>
      <header className="screen__head">
        <p className="label">{formatFullDay(view.date)}</p>
        <h1 className="screen__title">Today</h1>
      </header>

      {view.habits.length === 0 ? (
        <div className="empty">
          <p className="empty__lead">Nothing tracked yet.</p>
          <p className="empty__body">
            Add something you are trying to stop, or something you are trying to do. A day
            you do not log counts as a day you did not do it, so an ordinary day needs no
            attention at all.
          </p>
          <Button variant="solid" onClick={onAddHabit}>
            Add the first habit
          </Button>
        </div>
      ) : null}

      {negatives.length > 0 ? (
        <section className="group">
          <h2 className="group__label label">Staying away from</h2>
          <div className="group__bands">
            {negatives.map((card) => (
              <HabitBand
                key={card.id}
                card={card}
                today={view.date}
                onOpen={() => onOpenHabit(card.id)}
                onPickDay={(date) => pickDay(card.id, date)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {positives.length > 0 ? (
        <section className="group">
          <h2 className="group__label label">Keeping up</h2>
          <div className="group__bands">
            {positives.map((card) => (
              <HabitBand
                key={card.id}
                card={card}
                today={view.date}
                onOpen={() => onOpenHabit(card.id)}
                onPickDay={(date) => pickDay(card.id, date)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {editing && editingHabit ? (
        <LogSheet
          habit={editingHabit}
          date={editing.date}
          existing={editing.entry}
          reasons={view.reasons}
          onSave={async (payload) => {
            await onLog(editing.habitId, payload);
            await onRefresh();
          }}
          onRemove={async () => {
            await onUnlog(editing.habitId, editing.date);
            await onRefresh();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
