// Theme registry for the runtime-switchable theme system.
//
// HOW SWITCHING WORKS (see src/index.css for the CSS side):
//   - @theme declares each Tailwind color token as an INDIRECTION to a --k-* var
//     (e.g. --color-surface: var(--k-surface)). Tailwind emits utilities that
//     read var(--color-surface), which in turn reads var(--k-surface).
//   - Each theme is a plain CSS block ([data-theme="<id>"]) that sets the FULL
//     set of --k-* vars. Setting document.documentElement.dataset.theme = id
//     swaps every token value live, no rebuild, no React re-render needed.
//
// This module is the single source of truth for the PICKER: the ids here must
// match the [data-theme="<id>"] blocks in index.css, and the swatches are used
// to render preview dots without the picker hardcoding any hex.

export interface ThemePreset {
  id: string;
  name: string;
  /** A one-word vibe shown under the name in the picker. */
  blurb: string;
  /** True for dark themes (re-themes the whole shell, not just focus). */
  dark: boolean;
  /** Swatch colors for the picker preview: field, card, accent, text. */
  swatch: {
    field: string;
    card: string;
    accent: string;
    text: string;
  };
}

// The list the picker renders, in display order. Keep ids in sync with the
// [data-theme="<id>"] blocks in src/index.css. The swatch hexes here mirror the
// key tokens of each theme (--k-surface / --k-surface-raised / --k-accent /
// --k-text) so the preview dots match what you get when you apply the theme.
export const THEMES: ThemePreset[] = [
  {
    id: "paper",
    name: "Paper",
    blurb: "Warm light",
    dark: false,
    swatch: { field: "#eceae3", card: "#ffffff", accent: "#4c5b6e", text: "#33312e" },
  },
  {
    id: "snow",
    name: "Snow",
    blurb: "Cool light",
    dark: false,
    swatch: { field: "#f4f6f8", card: "#ffffff", accent: "#3b6db0", text: "#1f2937" },
  },
  {
    id: "sand",
    name: "Sand",
    blurb: "Warm sepia",
    dark: false,
    swatch: { field: "#efe7d8", card: "#fbf6ec", accent: "#b06a44", text: "#3a342a" },
  },
  {
    id: "dim",
    name: "Dim",
    blurb: "Soft dark",
    dark: true,
    swatch: { field: "#1f1e1d", card: "#2a2826", accent: "#8aa6c2", text: "#e8e4dd" },
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "True dark",
    dark: true,
    swatch: { field: "#101013", card: "#17181c", accent: "#7c9bff", text: "#eceef2" },
  },
  {
    id: "nocturne",
    name: "Nocturne",
    blurb: "Deep teal",
    dark: true,
    swatch: { field: "#0e1413", card: "#15201e", accent: "#48c2a8", text: "#e4ece9" },
  },
];

export const DEFAULT_THEME = "paper";

const VALID = new Set(THEMES.map((t) => t.id));

/** Coerce an arbitrary stored value to a known theme id (default on miss). */
export function normalizeTheme(id: string | null | undefined): string {
  return id != null && VALID.has(id) ? id : DEFAULT_THEME;
}

/** Apply a theme by id to <html> (synchronous; safe to call before render). */
export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = normalizeTheme(id);
}
