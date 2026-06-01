import { useEffect, useRef, useState } from "react";
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
import { DoneRow } from "./DoneRow";
import { OverdueBand } from "./OverdueBand";
import { AddTask } from "./AddTask";

interface DayColumnProps {
  date: string; // "yyyy-MM-dd"
  tasks: Task[];
}

// How long the leaving (fade + collapse) animation runs before a completed task
// is partitioned into the Done group. Matches the CSS transition duration below.
const COMPLETE_ANIM_MS = 150;

// One day in the unified week strip: a thin header (weekday + date, Today
// marker, open-task estimate total) over a task list and an inline add. Clicking
// the header SELECTS this day, which drives the right-hand Timeline panel and
// is highlighted here. The whole column is a droppable so a task can be dragged
// onto an empty day; rows are sortable for in-column reordering. Today's column
// also shows an Overdue band of carry-over tasks at the top. Done tasks are
// demoted to a collapsed "Done" group at the bottom.
export function DayColumn({ date, tasks }: DayColumnProps) {
  const setDate = usePlanner((s) => s.setDate);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const addToWeekDay = usePlanner((s) => s.addToWeekDay);
  const toggleComplete = usePlanner((s) => s.toggleComplete);

  const { setNodeRef, isOver } = useDroppable({
    id: `col-${date}`,
    data: { type: "column", date },
  });

  // Ids mid-completion: still in the open list (status not yet flipped) but
  // playing the leaving animation. The timeout flips status via toggleComplete,
  // which moves the row into the Done group on the next render.
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Done group is collapsed by default so finished work stays out of the way.
  const [doneOpen, setDoneOpen] = useState(false);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const beginComplete = (task: Task) => {
    if (timers.current.has(task.id)) return;
    setLeaving((prev) => new Set(prev).add(task.id));
    const handle = setTimeout(() => {
      timers.current.delete(task.id);
      toggleComplete(task);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }, COMPLETE_ANIM_MS);
    timers.current.set(task.id, handle);
  };

  const isToday = date === todayKey();
  const isSelected = date === selectedDate;
  // A row that is mid-completion stays in the open (sortable) list until its
  // animation finishes, so it does not double-count or jump into Done early.
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const plannedMinutes = open.reduce(
    (sum, t) => sum + (t.estimate_minutes ?? 0),
    0,
  );

  return (
    <div
      data-day={date}
      className={
        // A 2px top border on every column keeps content alignment identical
        // across columns; only the selected one colors it indigo so it visually
        // connects up to the timeline panel on the right.
        "flex w-60 shrink-0 flex-col border-r border-t-2 border-neutral-200 " +
        (isSelected
          ? "border-t-indigo-500 bg-indigo-50/30"
          : "border-t-transparent")
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
            <span className="rounded bg-indigo-500 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-white">
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
        {isToday && <OverdueBand />}

        <div className="mb-0.5 flex items-baseline justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {open.length} open
          </span>
        </div>

        {open.length === 0 ? (
          <p className="px-1 py-1.5 text-[11px] text-neutral-300">No tasks.</p>
        ) : (
          <SortableContext
            items={open.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1">
              {open.map((task) => {
                const isLeaving = leaving.has(task.id);
                return (
                  // The wrapper plays the leaving animation; TaskItem keeps its
                  // own sortable <li> as the dnd node. max-height is generous so
                  // a normal row is unconstrained and only the collapse animates.
                  <div
                    key={task.id}
                    style={{
                      maxHeight: isLeaving ? 0 : 400,
                      opacity: isLeaving ? 0 : 1,
                      transform: isLeaving ? "translateX(6px)" : "none",
                      overflow: "hidden",
                      transition:
                        "max-height 150ms ease, opacity 150ms ease, transform 150ms ease",
                    }}
                  >
                    <TaskItem
                      task={task}
                      bucket="day"
                      column={date}
                      onComplete={beginComplete}
                    />
                  </div>
                );
              })}
            </ul>
          </SortableContext>
        )}

        {done.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setDoneOpen((v) => !v)}
              className="flex w-full items-center gap-1 px-1 py-0.5 text-left"
            >
              <span className="text-[10px] leading-none text-neutral-400">
                {doneOpen ? "▾" : "▸"}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Done ({done.length})
              </span>
            </button>
            {doneOpen && (
              <ul className="mt-1 flex flex-col gap-1">
                {done.map((task) => (
                  <DoneRow key={task.id} task={task} />
                ))}
              </ul>
            )}
          </div>
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
