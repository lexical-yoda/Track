/* Sign in, or first-run setup.
 *
 * The same screen does both: on a fresh instance there is no account yet, so it
 * asks for a username and a password to create rather than to check. It says
 * which it is doing, because an instance that quietly accepted any credentials
 * would be a serious thing to get wrong.
 */

import { useState } from "react";
import { Button, Field, Notice } from "../components/ui";

interface AuthProps {
  initialised: boolean;
  onSignIn: (username: string, password: string) => Promise<void>;
  onSetUp: (username: string, password: string) => Promise<void>;
}

export function Auth({ initialised, onSignIn, onSetUp }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!initialised) {
      if (password.length < 8) {
        setError("Choose a password of at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The two passwords do not match.");
        return;
      }
    }

    setBusy(true);
    try {
      await (initialised ? onSignIn(username, password) : onSetUp(username, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={submit}>
        <p className="marker">{initialised ? "track" : "first run"}</p>
        <h1 className="auth__title">{initialised ? "Sign in" : "Set up Track"}</h1>
        <p className="auth__lead">
          {initialised
            ? "One account, yours."
            : "Pick the username and password you will use from now on. There is no recovery, so put them in your password manager."}
        </p>

        <Field label="Username">
          <input
            className="input"
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </Field>

        <Field label="Password" hint={initialised ? undefined : "At least 8 characters."}>
          <input
            className="input"
            type="password"
            value={password}
            autoComplete={initialised ? "current-password" : "new-password"}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        {initialised ? null : (
          <Field label="Password again">
            <input
              className="input"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </Field>
        )}

        {error ? <Notice>{error}</Notice> : null}

        <Button type="submit" variant="solid" disabled={busy} full>
          {initialised ? "Sign in" : "Create the account"}
        </Button>
      </form>
    </main>
  );
}
