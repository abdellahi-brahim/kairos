import { usePlanner } from "../store";
import { prettyDate } from "../lib/date";

// Surfaces unfinished tasks from previous days so they can be pulled into today.
export function CarryOverStrip() {
  const carryOver = usePlanner((s) => s.carryOver);
  const moveToToday = usePlanner((s) => s.moveToToday);
  const moveAllToToday = usePlanner((s) => s.moveAllToToday);

  if (carryOver.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Carry-over · {carryOver.length}
        </span>
        <button
          onClick={() => moveAllToToday(carryOver.map((t) => t.id))}
          className="text-xs font-medium text-amber-700 hover:underline"
        >
          Move all to today
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {carryOver.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-2 rounded px-1 py-1 text-sm"
          >
            <span className="flex-1 truncate text-neutral-700">
              {task.title}
            </span>
            <span className="shrink-0 text-[10px] text-amber-600">
              {prettyDate(task.planned_date!)}
            </span>
            <button
              onClick={() => moveToToday(task.id)}
              className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
            >
              → Today
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
