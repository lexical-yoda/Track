/* The colours and symbols offered when a habit is set up.
 *
 * Neither list is a limit: the colour grid sits beside the system colour well,
 * and the symbol grid beside a field that takes any character. They exist
 * because picking from eighteen good colours is faster than mixing one, and
 * because a grid of symbols is the only way to remember what is available.
 *
 * The colours are a single ramp of hues at roughly matched chroma and
 * lightness, so that no habit shouts over its neighbours in a list and every
 * one of them still holds against both the near-black and the paper ground.
 */

import type { CSSProperties } from "react";
import type { Habit } from "./types";

export interface PaletteColor {
  name: string;
  value: string;
}

export const DEFAULT_COLOR = "#3FA87B";

export const PALETTE: PaletteColor[] = [
  { name: "Vermilion", value: "#E2574C" },
  { name: "Ember", value: "#E0813F" },
  { name: "Brass", value: "#D4A32E" },
  { name: "Lichen", value: "#A9B23F" },
  { name: "Fern", value: "#6AAE4C" },
  { name: "Verdigris", value: "#3FA87B" },
  { name: "Teal", value: "#2EA7A2" },
  { name: "Cobalt", value: "#3B93C6" },
  { name: "Indigo", value: "#4F77D0" },
  { name: "Iris", value: "#7E6CD2" },
  { name: "Violet", value: "#A862C9" },
  { name: "Magenta", value: "#D25CA2" },
  { name: "Rose", value: "#D85873" },
  { name: "Clay", value: "#B9704A" },
  { name: "Umber", value: "#8C6A4E" },
  { name: "Iron", value: "#7E8894" },
  { name: "Slate", value: "#5F7285" },
  { name: "Graphite", value: "#9A9086" },
];

/** The name of a palette colour, or the hex itself for one picked by hand. */
export function colorName(value: string): string {
  const match = PALETTE.find(
    (color) => color.value.toLowerCase() === value.toLowerCase(),
  );
  return match ? match.name : value.toUpperCase();
}

/* Symbols are stored as text rather than as the name of an icon in a pack: the
 * CSP allows nothing from another origin, so a pack would have to be bundled
 * and would still only cover what someone thought to draw. An emoji is already
 * on the device, in colour, at every size, and the field below the grid takes
 * anything the keyboard can type — including a letter, which is what a habit
 * with no symbol falls back to anyway.
 *
 * These are content, not iconography: the app's own icons are the hand-set
 * strokes in ui.tsx, and nothing here is ever used for a control.
 * avoid-ai-design-ignore: I2 */
export const SYMBOLS: string[] = [
  // Things to stay away from
  "🚬", "🍺", "🍷", "🥃", "🍬", "🍔", "🍟", "🥤", "🎰", "🛒",
  "📱", "📺", "🎮", "💸", "☕", "🧋", "🍰", "😤",
  // Things to keep up
  "🏋️", "🏃", "🚴", "🏊", "🧘", "🥊", "⚽", "🏀", "🎾", "🥾",
  "📚", "✍️", "🎸", "🎹", "🎨", "🗣️", "💻", "📝",
  // The day's own business
  "💧", "🥗", "🍎", "🥦", "😴", "🛏️", "🦷", "🧴", "🧹", "🧺",
  "☀️", "🌙", "⏰", "🙏", "🧭", "📅",
  // Plain marks
  "❤️", "⭐", "✅", "⚡", "🔥", "🌱", "🎯", "⏳", "●", "◆",
];

/** The mark a habit shows: its symbol, or the first letter of its name. */
export function habitMark(habit: Pick<Habit, "icon" | "name">): string {
  if (habit.icon.trim() !== "") return habit.icon;
  return habit.name.trim().charAt(0).toUpperCase() || "·";
}

/** The habit's colour, handed to CSS so the stylesheet can derive the rest.
 *
 * Everything tinted in the app — the card wash, its edge, the mark's well, the
 * days of a positive habit — is mixed from this one value in `tokens.css`,
 * which is why the element also needs the `tinted` class.
 */
export function habitStyle(habit: Pick<Habit, "color">): CSSProperties {
  return { "--habit": habit.color } as CSSProperties;
}
