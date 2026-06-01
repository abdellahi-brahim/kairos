import { useEffect, useState } from "react";
import { usePlanner } from "../store";
import type { Task } from "../types";
import { formatDuration, todayKey } from "../lib/date";
import { DEFAULT_BLOCK_MIN, timeToMinutes } from "../lib/timeline";
import { Checkbox } from "./Checkbox";

// Current local minute-of-day (hours*60 + minutes).
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// Resolve the focused task wherever it lives (day buckets, backlog, carry-over,
// or any loaded week column) so a task on a non-selected day still resolves.
function resolveFocusTask(s: {
  focusTaskId: number | null;
  dayTasks: Task[];
  backlog: Task[];
  carryOver: Task[];
  weekTasks: Record<string, Task[]>;
}): Task | undefined {
  if (s.focusTaskId == null) return undefined;
  const direct = [...s.dayTasks, ...s.backlog, ...s.carryOver].find(
    (t) => t.id === s.focusTaskId,
  );
  if (direct) return direct;
  for (const key of Object.keys(s.weekTasks)) {
    const found = s.weekTasks[key].find((t) => t.id === s.focusTaskId);
    if (found) return found;
  }
  return undefined;
}

// Full-screen, calm single-task surface. This is the one place we intentionally
// break the high-density aesthetic: larger type, generous spacing, no clutter.
// Rendered by App when focusTaskId != null.
export function ZenMode() {
  const focusTaskId = usePlanner((s) => s.focusTaskId);
  // Resolve the focused task wherever it lives, including the week map, so a task
  // on a non-selected day still resolves (mirrors how the detail modal resolves
  // its task but widened to the week map).
  const task = usePlanner((s) => resolveFocusTask(s));
  const subtasks = usePlanner((s) => s.focusSubtasks);
  // Adjacency for muting Prev/Next: build the same scheduled queue the store
  // uses, then check whether an adjacent item exists. Mirrors buildFocusQueue;
  // kept here (a small selector) so the buttons can visually reflect state.
  const { hasPrev, hasNext } = usePlanner((s) => {
    if (s.focusTaskId == null) return { hasPrev: false, hasNext: false };
    // Zen always walks the CURRENT day's scheduled tasks (mirrors the store's
    // buildFocusQueue). A focused task not in today's queue gets index -1, so
    // Next jumps to today's first block and Prev is off.
    const today = todayKey();
    let dayList = s.weekTasks[today];
    if (dayList == null && today === s.selectedDate) dayList = s.dayTasks;
    if (dayList == null) dayList = [];
    const queue = dayList
      .filter((t) => t.scheduled_start != null)
      .sort(
        (a, b) =>
          timeToMinutes(a.scheduled_start!) - timeToMinutes(b.scheduled_start!),
      );
    const index = queue.findIndex((t) => t.id === s.focusTaskId);
    if (index === -1) {
      // Unscheduled entry: Next jumps to the first scheduled item, Prev is off.
      return { hasPrev: false, hasNext: queue.length > 0 };
    }
    return { hasPrev: index > 0, hasNext: index < queue.length - 1 };
  });
  const closeFocus = usePlanner((s) => s.closeFocus);
  const focusNext = usePlanner((s) => s.focusNext);
  const focusPrev = usePlanner((s) => s.focusPrev);
  const completeFocus = usePlanner((s) => s.completeFocus);
  const toggleFocusSubtask = usePlanner((s) => s.toggleFocusSubtask);

  // A slow tick (~30s) drives the live "time left" and session-elapsed readouts.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard: Esc closes, Left/Right move prev/next. Ignored while focus in an
  // editable node (there should be none here, but be safe).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeFocus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        focusNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFocus, focusPrev, focusNext]);

  if (focusTaskId == null || !task) return null;

  const done = task.status === "done";
  const running = !!task.timer_started_at;

  // Schedule line. For a scheduled task, show the planned block and a live
  // "time left" against the block end; otherwise show the estimate.
  let scheduleLine: React.ReactNode = null;
  if (task.scheduled_start) {
    const startMin = timeToMinutes(task.scheduled_start);
    const endMin = startMin + (task.estimate_minutes ?? DEFAULT_BLOCK_MIN);
    const remaining = endMin - nowMinutes();
    const endLabel = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
    const remainLabel =
      remaining >= 0
        ? `${formatDuration(remaining)} left`
        : `${formatDuration(-remaining)} over`;
    scheduleLine = (
      <p className="text-[15px] tabular-nums text-neutral-400">
        <span className="text-neutral-300">
          {task.scheduled_start} - {endLabel}
        </span>{" "}
        <span className={remaining >= 0 ? "text-neutral-500" : "text-amber-400"}>
          - {remainLabel}
        </span>
      </p>
    );
  } else {
    scheduleLine = (
      <p className="text-[15px] text-neutral-500">
        {task.estimate_minutes != null
          ? formatDuration(task.estimate_minutes)
          : "No estimate"}
      </p>
    );
  }

  // Live session elapsed (only when running): now - timer_started_at.
  let sessionLabel: string | null = null;
  if (running && task.timer_started_at) {
    const elapsedMs = Date.now() - new Date(task.timer_started_at).getTime();
    const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
    sessionLabel = `Focused ${formatDuration(elapsedMin)}`;
  }

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-neutral-900 text-neutral-100">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-8 py-10">
        {/* Top bar: Exit. */}
        <div className="mb-10 flex items-center justify-end">
          <button
            onClick={() => closeFocus()}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-400">
              Esc
            </span>
            <span aria-hidden>✕</span>
            <span className="sr-only">Exit focus</span>
          </button>
        </div>

        {/* Schedule line. */}
        <div className="mb-3">{scheduleLine}</div>

        {/* Title. */}
        <h1
          className={
            "text-3xl font-semibold leading-tight " +
            (done ? "text-neutral-500 line-through" : "text-neutral-50")
          }
        >
          {task.title}
        </h1>

        {/* Session indicator. */}
        {sessionLabel && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {sessionLabel}
          </div>
        )}

        {/* Description (read-only rich text). */}
        <div className="mt-8">
          {task.notes ? (
            <div
              className="rt-content rt-content-zen"
              dangerouslySetInnerHTML={{ __html: task.notes }}
            />
          ) : (
            <p className="text-[15px] text-neutral-500">No description.</p>
          )}
        </div>

        {/* Subtasks. */}
        {subtasks.length > 0 && (
          <div className="mt-10">
            <div className="mb-3 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
              Subtasks
              <span className="font-medium tabular-nums text-neutral-500">
                {doneCount}/{subtasks.length} done
              </span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {subtasks.map((sub) => (
                <li key={sub.id} className="flex items-center gap-3">
                  <Checkbox
                    checked={!!sub.done}
                    onChange={() => toggleFocusSubtask(sub)}
                  />
                  <span
                    className={
                      "text-[16px] " +
                      (sub.done
                        ? "text-neutral-500 line-through"
                        : "text-neutral-200")
                    }
                  >
                    {sub.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer controls: Prev | Complete | Next. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-12">
          <button
            onClick={() => focusPrev()}
            disabled={!hasPrev}
            className={
              "rounded-md px-4 py-2 text-[14px] " +
              (hasPrev
                ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                : "cursor-default text-neutral-700")
            }
          >
            ‹ Prev
          </button>
          <button
            onClick={() => completeFocus()}
            className="rounded-md bg-indigo-500 px-6 py-2.5 text-[15px] font-medium text-white hover:bg-indigo-400"
          >
            Complete
          </button>
          <button
            onClick={() => focusNext()}
            disabled={!hasNext}
            className={
              "rounded-md px-4 py-2 text-[14px] " +
              (hasNext
                ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                : "cursor-default text-neutral-700")
            }
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
