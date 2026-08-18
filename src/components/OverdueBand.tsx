import { useState } from "react";
import { usePlanner } from "../store";
import { OverdueRow } from "./OverdueRow";

// A compact "needs attention" band at the top of today's column listing
// carry-over tasks (unfinished tasks from past days). It is the only way to see
// and recover tasks older than the loaded week window. Collapsible so it does
// not dominate the column; rows are read-only (see OverdueRow) to avoid a
// duplicate dnd id with the same task in its past-day column.
export function OverdueBand() {
  const carryOver = usePlanner((s) => s.carryOver);
  const moveAllToToday = usePlanner((s) => s.moveAllToToday);
  const [expanded, setExpanded] = useState(false);

  if (carryOver.length === 0) return null;

  return (
    // Softened: one alert left-rail + a faint alert tint, no full bordered card
    // (REMOVAL of the two-border rose box). The label is sentence case and
    // muted-alert, not a loud uppercase header.
    <div className="mb-2 rounded-md border-l-2 border-l-alert bg-alert-soft/50">
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-1 text-left"
        >
          <span className="text-[11px] leading-none text-alert">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="text-[12px] font-medium text-alert">
            Overdue ({carryOver.length})
          </span>
        </button>
        <button
          onClick={() => moveAllToToday(carryOver.map((t) => t.id))}
          title="Move all overdue tasks to today"
          className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-alert hover:bg-alert-soft"
        >
          Move all to today
        </button>
      </div>

      {expanded && (
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {carryOver.map((task) => (
            <OverdueRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
