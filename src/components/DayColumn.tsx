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
  // "strip" (default): half of the scrolling center viewport. "day": fills the
  // parent width for the single expanded Day view.
  variant?: "strip" | "day";
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
export function DayColumn({ date, tasks, variant = "strip" }: DayColumnProps) {
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
  const isDay = variant === "day";
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
        // Strip: two-up layout in the center viewport with a sensible min width.
        // Day view still fills the available width.
        "flex flex-col bg-surface-raised " +
        (isDay
          ? "w-full "
          : "week-strip-day border-r border-soft ")
      }
    >
      <button
        onClick={() => setDate(date)}
        title="Select this day for the timeline"
        className="flex h-[52px] items-center gap-3 border-b border-soft bg-surface-raised px-4 text-left hover:bg-accent-faint"
      >
        <span
          className={
            "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[16px] font-semibold tabular-nums " +
            (isSelected
              ? "bg-accent text-white"
              : isToday
                ? "text-accent"
                : "text-text")
          }
        >
          {dayOfMonth(date)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-semibold text-text">
            {weekdayShort(date)}
          </span>
          <span className="text-[11px] text-muted">
            {isToday ? `Today, ${open.length} open` : `${open.length} open`}
          </span>
        </span>
        {plannedMinutes > 0 && (
          <span className="text-[11px] tabular-nums text-muted">
            {formatDuration(plannedMinutes)}
          </span>
        )}
      </button>

      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col overflow-y-auto bg-surface px-2.5 py-2.5 " +
          (isOver ? "bg-accent-soft/60" : "")
        }
      >
        {isToday && <OverdueBand />}

        {open.length > 0 && (
          <SortableContext
            items={open.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2.5">
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
                      detailed={isDay}
                    />
                  </div>
                );
              })}
            </ul>
          </SortableContext>
        )}

        {done.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setDoneOpen((v) => !v)}
              className="flex w-full items-center gap-1 px-1 py-0.5 text-left"
            >
              <span className="text-[11px] leading-none text-muted">
                {doneOpen ? "▾" : "▸"}
              </span>
              <span className="text-[12px] font-medium text-muted">
                Done ({done.length})
              </span>
            </button>
            {doneOpen && (
              <ul className="mt-1 flex flex-col gap-1.5">
                {done.map((task) => (
                  <DoneRow key={task.id} task={task} />
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={open.length > 0 ? "mt-1 px-0.5" : "px-0.5"}>
          <AddTask
            placeholder="New task"
            onAdd={(title) => addToWeekDay(date, title)}
          />
        </div>
      </div>
    </div>
  );
}
