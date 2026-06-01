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
  const [expanded, setExpanded] = useState(true);

  if (carryOver.length === 0) return null;

  return (
    <div className="mb-1.5 rounded-md border border-rose-200 border-l-2 border-l-rose-400 bg-rose-50/40">
      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-1 text-left"
        >
          <span className="text-[9px] leading-none text-rose-400">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-rose-500">
            Overdue ({carryOver.length})
          </span>
        </button>
        <button
          onClick={() => moveAllToToday(carryOver.map((t) => t.id))}
          title="Move all overdue tasks to today"
          className="shrink-0 rounded border border-rose-200 bg-white px-1 py-0.5 text-[10px] font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600"
        >
          Move all to today
        </button>
      </div>

      {expanded && (
        <ul className="flex flex-col gap-1 px-1.5 pb-1.5">
          {carryOver.map((task) => (
            <OverdueRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
