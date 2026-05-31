import { usePlanner } from "../store";
import { DateNav } from "./DateNav";
import { AddTask } from "./AddTask";
import { TaskList } from "./TaskList";
import { formatDuration } from "../lib/date";

export function DayView() {
  const dayTasks = usePlanner((s) => s.dayTasks);
  const backlog = usePlanner((s) => s.backlog);
  const loading = usePlanner((s) => s.loading);
  const addToDay = usePlanner((s) => s.addToDay);
  const addToBacklog = usePlanner((s) => s.addToBacklog);

  const open = dayTasks.filter((t) => t.status !== "done");
  const doneCount = dayTasks.length - open.length;
  const plannedMinutes = open.reduce(
    (sum, t) => sum + (t.estimate_minutes ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-800">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <DateNav />
        <div className="text-sm text-neutral-500">
          {plannedMinutes > 0 && (
            <span className="font-medium text-neutral-700">
              {formatDuration(plannedMinutes)}
            </span>
          )}
          {plannedMinutes > 0 && " planned"}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Planning panel */}
        <section className="flex w-[440px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 px-4 py-4">
          <div className="mb-1 flex items-baseline justify-between px-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              This day
            </h2>
            <span className="text-xs text-neutral-400">
              {open.length} open{doneCount > 0 ? ` · ${doneCount} done` : ""}
            </span>
          </div>

          {loading ? (
            <p className="px-2 py-3 text-sm text-neutral-400">Loading…</p>
          ) : (
            <TaskList
              bucket="day"
              tasks={dayTasks}
              emptyText="No tasks yet. Add one below or pull from the backlog."
            />
          )}

          <div className="mt-2 px-1">
            <AddTask placeholder="Add a task for this day…" onAdd={addToDay} />
          </div>

          <div className="my-4 border-t border-neutral-200" />

          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Backlog
          </h2>
          <TaskList
            bucket="backlog"
            tasks={backlog}
            emptyText="Backlog is empty."
          />
          <div className="mt-2 px-1">
            <AddTask placeholder="Add to backlog…" onAdd={addToBacklog} />
          </div>
        </section>

        {/* Timeline placeholder (filled in Phase 3) */}
        <section className="flex flex-1 items-center justify-center px-6 py-4">
          <p className="max-w-xs text-center text-sm text-neutral-400">
            Timeline and timeblocking arrive in the next phase. Drag tasks onto
            an hour to schedule them.
          </p>
        </section>
      </div>
    </div>
  );
}
