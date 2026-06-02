import type { ReactNode } from "react";
import { TAG_CHIP_CLASS, tagDotColor } from "../lib/tags";

// A calm tag lozenge shared by every place tags render (cards, overdue/done
// rows, the editor). Near-neutral surface + muted text + a tiny low-chroma dot
// for identity. `as` lets the caller render it as a button (clickable card
// chip) or a span (editor). `trailing` slots in the editor's remove button.
export function TagChip({
  name,
  onClick,
  trailing,
}: {
  name: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tagDotColor(name) }}
        aria-hidden
      />
      {name}
      {trailing}
    </>
  );
  const cls =
    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] " + TAG_CHIP_CLASS;
  if (onClick) {
    return (
      <button onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <span className={cls}>{inner}</span>;
}
