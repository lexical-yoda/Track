/* Logging a day.
 *
 * This is the screen that decides whether the app gets used honestly, so the
 * shape of it matters more than anywhere else:
 *
 *  - Saving needs nothing but the day. The note, the amount and the reason are
 *    all optional, and the save button is reachable without touching any of
 *    them.
 *  - For a habit that allows them, the planned-exception switch sits above the
 *    note, because deciding "this was a choice, not a relapse" is the first
 *    thing you know and it changes what the rest of the form means.
 *  - Nothing here congratulates or scolds. A logged slip is a record.
 */

import { useState } from "react";
import { formatFullDay, relativeDay } from "../lib/format";
import type { Entry, Habit, Reason } from "../lib/types";
import { Button, Field, Notice, Sheet, Switch } from "./ui";

interface LogSheetProps {
  habit: Habit;
  date: string;
  existing: Entry | null;
  reasons: Reason[];
  onSave: (payload: {
    date: string;
    amount: number | null;
    note: string | null;
    reason_id: number | null;
    planned: boolean;
  }) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

export function LogSheet({
  habit,
  date,
  existing,
  reasons,
  onSave,
  onRemove,
  onClose,
}: LogSheetProps) {
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [reasonId, setReasonId] = useState<number | null>(existing?.reason_id ?? null);
  const [planned, setPlanned] = useState(existing?.planned ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const negative = habit.kind === "negative";

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
    const parsed = amount.trim() === "" ? null : Number(amount);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setError("Amount must be a positive number, or left empty.");
      return;
    }
    return run(() =>
      onSave({
        date,
        amount: parsed,
        note: note.trim() === "" ? null : note.trim(),
        reason_id: reasonId,
        planned,
      }),
    );
  }

  return (
    <Sheet
      title={negative ? `Log a slip — ${habit.name}` : `Mark done — ${habit.name}`}
      subtitle={`${formatFullDay(date)}, ${relativeDay(date)}`}
      onClose={onClose}
    >
      {negative && habit.allows_planned ? (
        <Switch
          label="A planned exception"
          hint="Keeps your run intact. Still recorded, and counted separately."
          checked={planned}
          onChange={setPlanned}
        />
      ) : null}

      <Field
        label={habit.unit ? `How much (${habit.unit})` : "How much"}
        hint="Optional."
      >
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="—"
        />
      </Field>

      {negative ? (
        <Field label="What was going on" hint="Optional. Builds the pattern over time.">
          <div className="chips">
            {reasons.map((reason) => (
              <button
                key={reason.id}
                type="button"
                className={`chip${reasonId === reason.id ? " is-on" : ""}`}
                aria-pressed={reasonId === reason.id}
                onClick={() => setReasonId(reasonId === reason.id ? null : reason.id)}
              >
                {reason.label}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label="Note" hint="Optional.">
        <textarea
          className="input input--area"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={negative ? "Anything worth remembering about it." : "How it went."}
        />
      </Field>

      {error ? <Notice>{error}</Notice> : null}

      <div className="sheet__actions">
        <Button variant="solid" onClick={save} disabled={busy} full>
          {existing ? "Save changes" : negative ? "Record it" : "Mark done"}
        </Button>
        {existing ? (
          <Button variant="danger" onClick={() => run(onRemove)} disabled={busy} full>
            Remove this day
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
