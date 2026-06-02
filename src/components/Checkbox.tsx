import { useState } from "react";

// A small custom circular checkbox shared by every task row (TaskItem, OverdueRow,
// DoneRow). Replaces the native <input type="checkbox"> which renders
// inconsistently in WKWebView and cannot be animated.
//
// A real <button role="checkbox"> drives the toggle - this clicks reliably in
// WKWebView (unlike a visually-hidden native input behind a custom visual, which
// can swallow the gesture). The circle reads as "task"; the white check draws in
// over ~120ms via a scale+opacity transition. Hover is JS-driven (not CSS
// :hover) because WKWebView leaves :hover stuck after a drag; on hover an empty
// box shows a faint ghost check as an affordance.
export function Checkbox({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onChange}
      className={
        "flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors " +
        (checked
          ? "border-accent bg-accent"
          : hovered
            ? "border-accent bg-transparent"
            : "border-hairline bg-transparent")
      }
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          // Draw/fade in over ~120ms when checked. An empty box shows a faint
          // ghost check on hover as a click affordance. The unchecked ghost
          // check reads the live accent token so it follows the active theme
          // (dark themes need a light-on-dark accent here, not a fixed slate).
          color: checked ? "#ffffff" : "var(--color-accent)",
          opacity: checked ? 1 : hovered ? 0.5 : 0,
          transform: checked ? "scale(1)" : "scale(0.6)",
          transition: "opacity 120ms ease, transform 120ms ease, color 120ms ease",
        }}
      >
        <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
      </svg>
    </button>
  );
}
