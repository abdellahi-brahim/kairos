import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
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
          "flex items-center rounded-[8px] border px-2 py-1 text-[12px] leading-none transition-colors " +
          (open
            ? "border-soft bg-surface-raised text-text"
            : "border-transparent text-muted hover:border-soft hover:bg-accent-faint hover:text-text")
        }
      >
        <Palette className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-[10px] border border-hairline bg-surface-raised p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
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
                  "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left transition-colors " +
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
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
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
