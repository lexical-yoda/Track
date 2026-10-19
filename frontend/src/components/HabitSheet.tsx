/* Adding and editing a habit.
 *
 * The kind is fixed once created, because it decides what every entry on the
 * habit means and flipping it would silently reinterpret the history. Everything
 * else can be changed, including the start date — moving a quit date is a normal
 * thing to want, not an edge case.
 */

import { useState, type CSSProperties } from "react";
import { todayIso } from "../lib/format";
import { ACCENTS, type Accent, type Habit, type HabitPayload, type Kind } from "../lib/types";
import { Button, Field, Notice, Segmented, Sheet, Switch } from "./ui";

interface HabitSheetProps {
  habit: Habit | null;
  onSave: (payload: HabitPayload) => Promise<void>;
  onArchive?: (archived: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function HabitSheet({ habit, onSave, onArchive, onDelete, onClose }: HabitSheetProps) {
  const [name, setName] = useState(habit?.name ?? "");
  const [kind, setKind] = useState<Kind>(habit?.kind ?? "negative");
  const [accent, setAccent] = useState<Accent>(habit?.accent ?? "verdigris");
  const [startDate, setStartDate] = useState(habit?.start_date ?? todayIso());
  const [targetPerWeek, setTargetPerWeek] = useState(habit?.target_per_week ?? 7);
  const [allowsPlanned, setAllowsPlanned] = useState(habit?.allows_planned ?? false);
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [notes, setNotes] = useState(habit?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const negative = kind === "negative";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
      setBusy(false);
    }
  }

  function save() {
    if (name.trim() === "") {
      setError("Give it a name.");
      return;
    }
    if (startDate > todayIso()) {
      setError("The start date cannot be in the future.");
      return;
    }
    return run(() =>
      onSave({
        name: name.trim(),
        kind,
        accent,
        start_date: startDate,
        target_per_week: negative ? null : targetPerWeek,
        allows_planned: negative ? allowsPlanned : false,
        unit: unit.trim() === "" ? null : unit.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
      }),
    );
  }

  return (
    <Sheet
      title={habit ? `Edit ${habit.name}` : "Add a habit"}
      subtitle={habit ? undefined : "Two kinds: something to stay away from, or something to keep up."}
      onClose={onClose}
    >
      <Field label="Name">
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={negative ? "Smoking" : "Gym"}
          autoFocus={!habit}
        />
      </Field>

      {habit ? null : (
        <Field
          label="Kind"
          hint="This cannot be changed later, because it decides what a logged day means."
        >
          <Segmented
            ariaLabel="Kind of habit"
            value={kind}
            onChange={setKind}
            options={[
              { value: "negative", label: "Stay away from" },
              { value: "positive", label: "Keep up" },
            ]}
          />
        </Field>
      )}

      <Field
        label={negative ? "Quit date" : "Tracking from"}
        hint={
          negative
            ? "Your clean run counts from here."
            : "Days before this are not counted as missed."
        }
      >
        <input
          className="input"
          type="date"
          max={todayIso()}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </Field>

      {negative ? (
        <Switch
          label="Allow planned exceptions"
          hint="For the occasional party. A planned slip is recorded and counted, but leaves your run intact."
          checked={allowsPlanned}
          onChange={setAllowsPlanned}
        />
      ) : (
        <Field label="Days a week" hint="7 means every day.">
          <Segmented
            ariaLabel="Target days per week"
            value={String(targetPerWeek)}
            onChange={(value) => setTargetPerWeek(Number(value))}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </Field>
      )}

      <Field
        label="Unit"
        hint={`Optional. What you would count — ${negative ? "cigarettes, drinks" : "minutes, pages"}.`}
      >
        <input
          className="input"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          placeholder="—"
        />
      </Field>

      <Field label="Colour">
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {ACCENTS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === accent}
              aria-label={option}
              className={`swatch${option === accent ? " is-on" : ""}`}
              style={{ "--swatch": `var(--accent-${option})` } as CSSProperties}
              onClick={() => setAccent(option)}
            />
          ))}
        </div>
      </Field>

      <Field label="Why" hint="Optional. Worth reading back on a bad day.">
        <textarea
          className="input input--area"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>

      {error ? <Notice>{error}</Notice> : null}

      <div className="sheet__actions">
        <Button variant="solid" onClick={save} disabled={busy} full>
          {habit ? "Save changes" : "Add it"}
        </Button>

        {habit && onArchive ? (
          <Button variant="outline" onClick={() => run(() => onArchive(!habit.archived))} disabled={busy} full>
            {habit.archived ? "Unarchive" : "Archive"}
          </Button>
        ) : null}

        {habit && onDelete ? (
          confirmDelete ? (
            <>
              <Notice tone="error">
                Deleting removes this habit and every day logged against it. This cannot be
                undone. Export first from Settings if you want a copy.
              </Notice>
              <Button variant="danger" onClick={() => run(onDelete)} disabled={busy} full>
                Yes, delete it and all its history
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)} disabled={busy} full>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmDelete(true)} disabled={busy} full>
              Delete
            </Button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}
