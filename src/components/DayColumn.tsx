import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "../types";
import { usePlanner } from "../store";
import {
  dayOfMonth,
  formatDuration,
  todayKey,
  weekdayShort,
} from "../lib/date";
import { TaskItem } from "./TaskItem";
import { AddTask } from "./AddTask";

interface DayColumnProps {
  date: string; // "yyyy-MM-dd"
  tasks: Task[];
}

// One day in the unified week strip: a thin header (weekday + date, Today
// marker, open-task estimate total) over a task list and an inline add. Clicking
// the header SELECTS this day, which drives the right-hand Timeline panel and
// is highlighted here. The whole column is a droppable so a task can be dragged
// onto an empty day; rows are sortable for in-column reordering.
export function DayColumn({ date, tasks }: DayColumnProps) {
  const setDate = usePlanner((s) => s.setDate);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const addToWeekDay = usePlanner((s) => s.addToWeekDay);

  const { setNodeRef, isOver } = useDroppable({
    id: `col-${date}`,
    data: { type: "column", date },
  });

  const isToday = date === todayKey();
  const isSelected = date === selectedDate;
  const open = tasks.filter((t) => t.status !== "done");
  const doneCount = tasks.length - open.length;
  const plannedMinutes = open.reduce(
    (sum, t) => sum + (t.estimate_minutes ?? 0),
    0,
  );

  return (
    <div
      data-day={date}
      className={
        "flex w-60 shrink-0 flex-col border-r border-neutral-200 " +
        (isSelected ? "bg-indigo-50/30" : "")
      }
    >
      <button
        onClick={() => setDate(date)}
        title="Select this day for the timeline"
        className={
          "flex items-baseline justify-between gap-2 border-b px-2 py-1 text-left " +
          (isSelected
            ? "border-indigo-300 bg-indigo-100/70 ring-1 ring-inset ring-indigo-300"
            : isToday
              ? "border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50"
              : "border-neutral-200 bg-white hover:bg-neutral-50")
        }
      >
        <span className="flex items-baseline gap-1">
          <span className="text-[13px] font-semibold text-neutral-800">
            {weekdayShort(date)}
          </span>
          <span className="text-[13px] text-neutral-500">
            {dayOfMonth(date)}
          </span>
          {isToday && (
            <span className="rounded bg-indigo-500 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-white">
              Today
            </span>
          )}
        </span>
        {plannedMinutes > 0 && (
          <span className="text-[10px] tabular-nums text-neutral-400">
            {formatDuration(plannedMinutes)}
          </span>
        )}
      </button>

      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col overflow-y-auto px-1.5 py-1.5 " +
          (isOver ? "bg-indigo-50/60" : "")
        }
      >
        <div className="mb-0.5 flex items-baseline justify-between px-1">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
            {open.length} open{doneCount > 0 ? ` · ${doneCount} done` : ""}
          </span>
        </div>

        {tasks.length === 0 ? (
          <p className="px-1 py-1.5 text-[11px] text-neutral-300">No tasks.</p>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-px">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  bucket="day"
                  column={date}
                />
              ))}
            </ul>
          </SortableContext>
        )}

        <div className="mt-1 px-0.5">
          <AddTask
            placeholder="+ add"
            onAdd={(title) => addToWeekDay(date, title)}
          />
        </div>
      </div>
    </div>
  );
}
