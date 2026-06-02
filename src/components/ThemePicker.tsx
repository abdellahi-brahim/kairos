import { useEffect, useRef, useState } from "react";
import { usePlanner } from "../store";
import { THEMES } from "../lib/themes";

// Compact theme picker for the top toolbar. A small palette glyph opens a dense
// menu listing each preset with a tiny swatch row (field + card + accent dots)
// and its name. Clicking a row applies the theme immediately (setTheme, which
// persists and flips data-theme on <html>), marks the active one, and closes.
//
// Everything draws from the live tokens, so the menu itself re-themes with the
// rest of the shell. Swatch dots use the static hexes from the theme registry so
// each row previews what you would get, regardless of the active theme.
export function ThemePicker() {
  const theme = usePlanner((s) => s.theme);
  const setTheme = usePlanner((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape (the menu is not modal; it is a quiet popover).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          "flex items-center rounded px-1.5 py-0.5 text-[13px] leading-none transition-colors " +
          (open
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-accent-faint hover:text-text")
        }
      >
        {/* Palette glyph */}
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M8 1.5a6.5 6.5 0 0 0 0 13c.69 0 1.25-.56 1.25-1.25 0-.32-.13-.61-.33-.83-.2-.22-.32-.5-.32-.8 0-.66.54-1.2 1.2-1.2h1.4A3.3 3.3 0 0 0 14.5 7.1C14.5 3.96 11.6 1.5 8 1.5Zm-3.5 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1.5-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2.5 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-md border border-hairline bg-surface-raised py-1 shadow-lg"
        >
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors " +
                  (active ? "bg-accent-soft" : "hover:bg-accent-faint")
                }
              >
                {/* Swatch row: field + card + accent dots, drawn from the registry. */}
                <span className="flex shrink-0 items-center -space-x-1">
                  <Dot color={t.swatch.field} />
                  <Dot color={t.swatch.card} />
                  <Dot color={t.swatch.accent} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-text">
                    {t.name}
                  </span>
                  <span className="block truncate text-[10px] text-faint">
                    {t.blurb}
                  </span>
                </span>
                {active && (
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5 shrink-0 text-accent"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-3.5 w-3.5 rounded-full border border-hairline"
      style={{ backgroundColor: color }}
    />
  );
}
