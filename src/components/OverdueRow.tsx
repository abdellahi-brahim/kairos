import { useState } from "react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration, todayKey } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags, tagColor } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";
import { Checkbox } from "./Checkbox";

// Whole days that `planned_date` is behind today, for the "overdue by Nd" hint.
function overdueDays(plannedDate: string | null): number {
  if (!plannedDate) return 0;
  const today = todayKey();
  const ms = Date.parse(today) - Date.parse(plannedDate);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

// A dense, read-only task row for the Overdue band. Visually mirrors TaskItem
// (checkbox, priority dot, title -> detail modal, notes snippet, metadata
// footer) but deliberately does NOT register a dnd sortable/draggable: the same
// task is also rendered in its own past-day column inside the single shared
// DndContext, so reusing `task.id` here would create a duplicate dnd id and
// break drag/drop. The band's affordance is a one-click "to today" instead.
export function OverdueRow({ task }: { task: Task }) {
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const moveToToday = usePlanner((s) => s.moveToToday);
  const openDetail = usePlanner((s) => s.openDetail);

  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);

  const done = task.status === "done";
  const running = !!task.timer_started_at;
  const tags = parseTags(task.tags);
  const open = () => openDetail(task.id);
  const snippet = htmlToPlainText(task.notes);
  const daysLate = overdueDays(task.planned_date);
  const meta = priorityMeta(task.priority);

  // Priority left rail. border-left-color is more specific than the hover's
  // generic border-color swap, so the rail color survives the rose hover border.
  const railClass = task.priority > 0 ? " border-l-2 " + meta.rail : "";

  const hasMeta =
    daysLate > 0 ||
    task.estimate_minutes != null ||
    tags.length > 0 ||
    running ||
    task.actual_minutes > 0 ||
    (!!task.subtask_total && task.subtask_total > 0) ||
    (!!task.attachment_count && task.attachment_count > 0);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "rounded-md border bg-white px-2 py-1.5 " +
        (hovered ? "border-rose-200 shadow-sm" : "border-neutral-200") +
        railClass
      }
    >
      <div className="flex items-start gap-1.5">
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox checked={done} onChange={() => toggleComplete(task)} />
        </span>

        <button
          onClick={open}
          title={task.title}
          className={
            "min-w-0 flex-1 line-clamp-3 text-left text-[13px] font-medium leading-5 " +
            (done ? "text-neutral-400 line-through" : "text-neutral-800")
          }
        >
          {task.title}
        </button>

        <button
          onClick={() => moveToToday(task.id)}
          title="Move to today"
          className={
            "flex h-5 shrink-0 items-center rounded px-1 text-[10px] font-medium leading-none text-rose-500 hover:bg-rose-50 hover:text-rose-600 " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          → today
        </button>
      </div>

      {snippet && (
        <p className="line-clamp-2 pl-[1.375rem] pt-0.5 text-[11px] leading-snug text-neutral-400">
          {snippet}
        </p>
      )}

      {hasMeta && (
        <div className="flex flex-wrap items-center gap-1 pl-[1.375rem] pt-0.5 text-[11px] leading-none text-neutral-400">
          {daysLate > 0 && (
            <span
              title="How long this task is overdue"
              className="rounded bg-rose-50 px-1 py-0.5 font-medium tabular-nums text-rose-500"
            >
              {daysLate}d late
            </span>
          )}
          {task.estimate_minutes != null && (
            <button
              onClick={open}
              title="Estimate"
              className="rounded bg-indigo-50 px-1 py-0.5 font-medium tabular-nums text-indigo-600"
            >
              {formatDuration(task.estimate_minutes)}
            </button>
          )}
          {task.actual_minutes > 0 && (
            <button
              onClick={open}
              title="Tracked time"
              className="rounded bg-emerald-50 px-1 py-0.5 font-medium tabular-nums text-emerald-600"
            >
              {formatDuration(task.actual_minutes)}
            </button>
          )}
          {running && (
            <span
              title="Timer running"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
            />
          )}
          {!!task.subtask_total && task.subtask_total > 0 && (
            <button
              onClick={open}
              title="Subtasks"
              className="rounded bg-neutral-100 px-1 py-0.5 font-medium tabular-nums text-neutral-500"
            >
              ☑ {task.subtask_done ?? 0}/{task.subtask_total}
            </button>
          )}
          {!!task.attachment_count && task.attachment_count > 0 && (
            <button
              onClick={open}
              title="Attachments"
              className="rounded bg-neutral-100 px-1 py-0.5 font-medium tabular-nums text-neutral-500"
            >
              📎 {task.attachment_count}
            </button>
          )}
          {tags.slice(0, 2).map((t) => (
            <button
              key={t}
              onClick={open}
              className={"rounded px-1 py-0.5 font-medium " + tagColor(t)}
            >
              {t}
            </button>
          ))}
          {tags.length > 2 && <span>+{tags.length - 2}</span>}
        </div>
      )}
    </li>
  );
}
