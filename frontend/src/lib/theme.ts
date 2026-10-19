export type Theme = "system" | "dark" | "light";

const KEY = "track.theme";

/** Read the saved preference.
 *
 * Wrapped because localStorage throws rather than returning null in a private
 * window or with site data blocked, and a preference is never worth a blank
 * screen.
 */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    /* Unavailable storage falls through to the system default. */
  }
  return "system";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  // Keep the browser chrome and the PWA status bar in step with the page, read
  // back from the stylesheet so there is only one definition of the colour.
  const ground = getComputedStyle(root).getPropertyValue("--ground").trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", ground || "#151110");

  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* A preference that cannot be saved still applies for this session. */
  }
}
