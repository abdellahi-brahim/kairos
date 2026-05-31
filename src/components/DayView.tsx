import { usePlanner } from "../store";
import { DateNav } from "./DateNav";
import { PlannerBoard } from "./PlannerBoard";
import { formatDuration } from "../lib/date";

export function DayView() {
  const dayTasks = usePlanner((s) => s.dayTasks);

  const open = dayTasks.filter((t) => t.status !== "done");
  const plannedMinutes = open.reduce(
    (sum, t) => sum + (t.estimate_minutes ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-800">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <DateNav />
        {plannedMinutes > 0 && (
          <div className="text-sm text-neutral-500">
            <span className="font-medium text-neutral-700">
              {formatDuration(plannedMinutes)}
            </span>{" "}
            planned
          </div>
        )}
      </header>

      <PlannerBoard />
    </div>
  );
}
