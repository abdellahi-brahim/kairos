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
    id: "latte",
    name: "Kairos Light",
    blurb: "Neutral operational light",
    dark: false,
    swatch: { field: "#f5f5f7", card: "#ffffff", accent: "#2678d4", text: "#1d1d1f" },
  },
  {
    id: "rose-dawn",
    name: "Rose Dawn",
    blurb: "Soft rose light",
    dark: false,
    swatch: { field: "#faf4ed", card: "#fffaf3", accent: "#b4637a", text: "#575279" },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    blurb: "Low-fatigue light",
    dark: false,
    swatch: { field: "#fdf6e3", card: "#fffbf0", accent: "#268bd2", text: "#586e75" },
  },
  {
    id: "everforest-light",
    name: "Everforest Light",
    blurb: "Natural green light",
    dark: false,
    swatch: { field: "#fdf6e3", card: "#fffbef", accent: "#8da101", text: "#5c6a72" },
  },
  {
    id: "mocha",
    name: "Mocha",
    blurb: "Catppuccin dark",
    dark: true,
    swatch: { field: "#1e1e2e", card: "#313244", accent: "#cba6f7", text: "#cdd6f4" },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    blurb: "Premium dark",
    dark: true,
    swatch: { field: "#1a1b26", card: "#24283b", accent: "#7aa2f7", text: "#c0caf5" },
  },
  {
    id: "nord",
    name: "Nord",
    blurb: "Arctic dark",
    dark: true,
    swatch: { field: "#2e3440", card: "#3b4252", accent: "#88c0d0", text: "#eceff4" },
  },
  {
    id: "rose-moon",
    name: "Rose Pine Moon",
    blurb: "Cozy muted dark",
    dark: true,
    swatch: { field: "#232136", card: "#2a273f", accent: "#c4a7e7", text: "#e0def4" },
  },
  {
    id: "vscode-light",
    name: "VS Code Light",
    blurb: "Editor light",
    dark: false,
    swatch: { field: "#f3f3f3", card: "#ffffff", accent: "#005fb8", text: "#1f1f1f" },
  },
  {
    id: "vscode-dark",
    name: "VS Code Dark",
    blurb: "Iconic editor dark",
    dark: true,
    swatch: { field: "#1e1e1e", card: "#252526", accent: "#3794ff", text: "#d4d4d4" },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    blurb: "Primer light",
    dark: false,
    swatch: { field: "#f6f8fa", card: "#ffffff", accent: "#0969da", text: "#1f2328" },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    blurb: "Primer dark",
    dark: true,
    swatch: { field: "#0d1117", card: "#161b22", accent: "#2f81f7", text: "#e6edf3" },
  },
  {
    id: "jetbrains-light",
    name: "JetBrains Light",
    blurb: "New UI light",
    dark: false,
    swatch: { field: "#f7f8fa", card: "#ffffff", accent: "#3574f0", text: "#1a1a1a" },
  },
  {
    id: "jetbrains-darcula",
    name: "JetBrains Darcula",
    blurb: "Classic IDE dark",
    dark: true,
    swatch: { field: "#2b2b2b", card: "#3c3f41", accent: "#4a88c7", text: "#bbbbbb" },
  },
];

export const DEFAULT_THEME = "latte";

const VALID = new Set(THEMES.map((t) => t.id));

/** Coerce an arbitrary stored value to a known theme id (default on miss). */
export function normalizeTheme(id: string | null | undefined): string {
  return id != null && VALID.has(id) ? id : DEFAULT_THEME;
}

/** Apply a theme by id to <html> (synchronous; safe to call before render). */
export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = normalizeTheme(id);
}
