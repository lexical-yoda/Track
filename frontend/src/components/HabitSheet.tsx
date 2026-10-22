/* Adding and editing a habit.
 *
 * The kind is fixed once created, because it decides what every entry on the
 * habit means and flipping it would silently reinterpret the history. Everything
 * else can be changed, including the start date — moving a quit date is a normal
 * thing to want, not an edge case.
 */

import { useState, type CSSProperties } from "react";
import { todayIso } from "../lib/format";
import { colorName, DEFAULT_COLOR, habitMark, PALETTE, SYMBOLS } from "../lib/palette";
import type { Habit, HabitPayload, Kind } from "../lib/types";
import { Button, Field, Glyph, Mark, Notice, Segmented, Sheet, Switch } from "./ui";

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
  const [color, setColor] = useState(habit?.color ?? DEFAULT_COLOR);
  const [icon, setIcon] = useState(habit?.icon ?? "");
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
        icon: icon.trim(),
        color,
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

      <LookPicker
        name={name}
        kind={kind}
        color={color}
        icon={icon}
        onColor={setColor}
        onIcon={setIcon}
      />

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

interface LookPickerProps {
  name: string;
  kind: Kind;
  color: string;
  icon: string;
  onColor: (color: string) => void;
  onIcon: (icon: string) => void;
}

/** The colour and the symbol, picked together under a live preview.
 *
 * They are one control rather than two fields because they are never read
 * apart: the symbol sits in a well tinted with the colour, and a symbol that
 * works against one colour can disappear against another. The preview is the
 * habit's own card header at the size it will actually be drawn.
 */
function LookPicker({ name, kind, color, icon, onColor, onIcon }: LookPickerProps) {
  const preview = { icon, name: name.trim() === "" ? (kind === "negative" ? "Smoking" : "Gym") : name };

  return (
    <div
      className="field tinted"
      style={{ "--habit": color } as CSSProperties}
    >
      <span className="field__label">Colour and symbol</span>

      <div className="picker">
        <div className="picker__preview">
          <Mark habit={preview} size="lg" />
          <span className="picker__caption">
            <span className="picker__name">{preview.name}</span>
            <span className="label">{colorName(color)}</span>
          </span>

          {/* The system colour well. It sits with the preview rather than at
              the end of the suggested colours, where it was left stranded on a
              row of its own whenever the grid wrapped evenly. */}
          <label className="picker__well" title="Any other colour">
            <Glyph name="dropper" size={16} />
            <input
              type="color"
              value={color}
              aria-label="Any other colour"
              onChange={(event) => onColor(event.target.value.toUpperCase())}
            />
          </label>
        </div>

        <div className="swatches" role="radiogroup" aria-label="Colour">
          {PALETTE.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={option.value.toLowerCase() === color.toLowerCase()}
              aria-label={option.name}
              title={option.name}
              className={`swatch${option.value.toLowerCase() === color.toLowerCase() ? " is-on" : ""}`}
              style={{ "--swatch": option.value } as CSSProperties}
              onClick={() => onColor(option.value)}
            />
          ))}
        </div>

        <div className="symbols" role="radiogroup" aria-label="Symbol">
          <button
            type="button"
            role="radio"
            aria-checked={icon.trim() === ""}
            aria-label="No symbol"
            title="No symbol — the first letter of the name"
            className={`symbol symbol--none${icon.trim() === "" ? " is-on" : ""}`}
            onClick={() => onIcon("")}
          >
            {habitMark({ icon: "", name: preview.name })}
          </button>
          {SYMBOLS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === icon}
              aria-label={option}
              className={`symbol${option === icon ? " is-on" : ""}`}
              onClick={() => onIcon(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <input
          className="input"
          value={icon}
          maxLength={16}
          placeholder="Or type any emoji or character"
          aria-label="Symbol"
          onChange={(event) => onIcon(event.target.value)}
        />
      </div>

      <span className="field__hint">
        The colour marks this habit everywhere it appears, and fills its days on the
        chart. Leave the symbol blank to show the first letter of the name instead.
      </span>
    </div>
  );
}
