import { useState } from "react";
import { Button, Field, Glyph, Notice, Segmented, Spinner } from "../components/ui";
import { formatDay } from "../lib/format";
import type { Habit, Reason } from "../lib/types";
import type { Theme } from "../lib/theme";

interface SettingsProps {
  habits: Habit[] | null;
  reasons: Reason[];
  username: string | null;
  theme: Theme;
  error: string | null;
  onThemeChange: (theme: Theme) => void;
  onEditHabit: (habit: Habit) => void;
  onAddHabit: () => void;
  onMoveHabit: (habitId: number, direction: -1 | 1) => Promise<void>;
  onAddReason: (label: string) => Promise<void>;
  onDeleteReason: (id: number) => Promise<void>;
  onChangePassword: (current: string, next: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function Settings({
  habits,
  reasons,
  username,
  theme,
  error,
  onThemeChange,
  onEditHabit,
  onAddHabit,
  onMoveHabit,
  onAddReason,
  onDeleteReason,
  onChangePassword,
  onLogout,
}: SettingsProps) {
  if (error) return <Notice>{error}</Notice>;
  if (!habits) return <Spinner label="Loading settings" />;

  const active = habits.filter((habit) => !habit.archived);
  const archived = habits.filter((habit) => habit.archived);

  return (
    <>
      <header className="screen__head">
        <p className="label">{username ? `signed in as ${username}` : ""}</p>
        <h1 className="screen__title">Settings</h1>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Habits</h2>
          <span className="label">{active.length} active</span>
          <Button onClick={onAddHabit}>Add</Button>
        </div>
        {active.length === 0 ? (
          <p className="panel__foot">None yet.</p>
        ) : (
          <ul className="rows">
            {active.map((habit, index) => (
              <li className="rows__row" key={habit.id}>
                <span
                  className="rows__dot"
                  style={{ background: `var(--accent-${habit.accent})` }}
                  aria-hidden="true"
                />
                <button type="button" className="rows__main" onClick={() => onEditHabit(habit)}>
                  <span className="rows__name">{habit.name}</span>
                  <span className="label">
                    {habit.kind === "negative" ? "avoiding" : "keeping up"} · from{" "}
                    {formatDay(habit.start_date)}
                    {habit.allows_planned ? " · allows planned" : ""}
                  </span>
                </button>
                <span className="rows__move">
                  <button
                    type="button"
                    className="iconbtn iconbtn--sm"
                    aria-label={`Move ${habit.name} up`}
                    disabled={index === 0}
                    onClick={() => onMoveHabit(habit.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="iconbtn iconbtn--sm"
                    aria-label={`Move ${habit.name} down`}
                    disabled={index === active.length - 1}
                    onClick={() => onMoveHabit(habit.id, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section className="panel">
          <h2 className="panel__title">Archived</h2>
          <ul className="rows">
            {archived.map((habit) => (
              <li className="rows__row" key={habit.id}>
                <button type="button" className="rows__main" onClick={() => onEditHabit(habit)}>
                  <span className="rows__name">{habit.name}</span>
                  <span className="label">history kept, hidden from Today</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReasonEditor reasons={reasons} onAdd={onAddReason} onDelete={onDeleteReason} />

      <section className="panel">
        <h2 className="panel__title">Appearance</h2>
        <Segmented
          ariaLabel="Theme"
          value={theme}
          onChange={onThemeChange}
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Your data</h2>
        <p className="panel__foot">
          Both downloads include archived habits and every note. The database file itself
          lives in the container's data volume.
        </p>
        <div className="panel__actions">
          <a className="btn btn--outline" href="/api/export" download="track-export.json">
            Download JSON
          </a>
          <a className="btn btn--outline" href="/api/export.csv" download>
            Download CSV
          </a>
        </div>
      </section>

      <PasswordEditor onChange={onChangePassword} />

      <section className="panel">
        <Button variant="quiet" onClick={onLogout} full>
          Sign out
        </Button>
      </section>
    </>
  );
}

function ReasonEditor({
  reasons,
  onAdd,
  onDelete,
}: {
  reasons: Reason[];
  onAdd: (label: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (label.trim() === "") return;
    setBusy(true);
    try {
      await onAdd(label.trim());
      setLabel("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Reasons</h2>
      <p className="panel__foot">
        The tags offered when you log a slip. Deleting one keeps the slips; they simply lose
        that tag.
      </p>
      <div className="chips">
        {reasons.map((reason) => (
          <span className="chip chip--static" key={reason.id}>
            {reason.label}
            <button
              type="button"
              className="chip__remove"
              aria-label={`Delete ${reason.label}`}
              onClick={() => onDelete(reason.id)}
            >
              <Glyph name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="inline-form">
        <input
          className="input"
          value={label}
          placeholder="Add a reason"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
        />
        <Button onClick={add} disabled={busy || label.trim() === ""}>
          Add
        </Button>
      </div>
    </section>
  );
}

function PasswordEditor({
  onChange,
}: {
  onChange: (current: string, next: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function submit() {
    if (next.length < 8) {
      setMessage({ tone: "error", text: "The new password must be at least 8 characters." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onChange(current, next);
      setCurrent("");
      setNext("");
      setMessage({
        tone: "info",
        text: "Password changed. Every other device has been signed out.",
      });
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Could not change the password",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Password</h2>
      <Field label="Current password">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button onClick={submit} disabled={busy || current === "" || next === ""}>
        Change password
      </Button>
    </section>
  );
}
