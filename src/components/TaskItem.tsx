import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags, tagColor } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";

// A dense, title-first task row shared by every column (Inbox + day columns).
//
// Layout (vertical flex): a title line where the title always wins for space and
// wraps to up to 3 lines (line-clamp, never collapsing to "F..."), preceded only
// by the small fixed-width controls (drag handle, checkbox, priority dot); an
// optional muted notes snippet; then a compact, de-emphasized footer with all
// secondary metadata (scheduled time, estimate, tags, tracked time, subtasks).
// A bare task (no notes, no metadata) stays a tight near-single-line row; the
// card only grows as content requires.
export function TaskItem({
  task,
  bucket,
  column,
}: {
  task: Task;
  bucket: "day" | "backlog";
  // Week view only: which column this row currently lives in (a "yyyy-MM-dd"
  // day key, or "inbox"). Carried in the drag data so cross-column drops know
  // the source. The Day view omits it and relies on `bucket`.
  column?: string;
}) {
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);
  const openDetail = usePlanner((s) => s.openDetail);

  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", bucket, column, task } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const done = task.status === "done";
  const running = !!task.timer_started_at;
  const tags = parseTags(task.tags);
  const open = () => openDetail(task.id);

  // Notes are rich-text HTML (TipTap). Strip to plain text for a safe preview;
  // render the snippet only when there is actual text after stripping.
  const snippet = htmlToPlainText(task.notes);

  // Whether any footer metadata exists. Keeps the row to a single line when a
  // task is bare (the common Inbox case), preserving vertical density.
  const hasMeta =
    !!task.scheduled_start ||
    task.estimate_minutes != null ||
    tags.length > 0 ||
    running ||
    task.actual_minutes > 0 ||
    (!!task.subtask_total && task.subtask_total > 0);

  return (
    <li
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        // Every card carries a visible border + white surface + padding so
        // cards read as distinct units; hover just emphasizes.
        "rounded-md border bg-white px-2 py-1.5 " +
        (hovered ? "border-neutral-300 shadow-sm" : "border-neutral-200")
      }
    >
      {/* Title line: controls are fixed-width; the title flex-grows and wraps to
          up to 3 lines. Controls top-align so they sit on the first title line
          when it wraps. The h-5 wrappers keep them vertically centered on a
          single-line title, preserving the dense one-row look for bare tasks. */}
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={
            "flex h-5 shrink-0 cursor-grab items-center text-[11px] leading-none text-neutral-300 transition-opacity " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ⠿
        </button>

        <span className="flex h-5 shrink-0 items-center">
          <input
            type="checkbox"
            checked={done}
            onChange={() => toggleComplete(task)}
            className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
          />
        </span>

        {task.priority > 0 && (
          <span className="flex h-5 shrink-0 items-center">
            <span
              title={`${priorityMeta(task.priority).label} priority`}
              className={
                "h-1.5 w-1.5 rounded-full " + priorityMeta(task.priority).dot
              }
            />
          </span>
        )}

        <button
          onClick={open}
          title={task.title}
          className={
            "min-w-0 flex-1 line-clamp-3 text-left text-[13px] leading-5 " +
            (done ? "text-neutral-400 line-through" : "text-neutral-800")
          }
        >
          {task.title}
        </button>

        <button
          aria-label="Delete task"
          onClick={() => removeTask(task.id)}
          className={
            "flex h-5 shrink-0 items-center rounded px-1 text-[11px] leading-none text-neutral-400 hover:bg-red-50 hover:text-red-500 " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ✕
        </button>
      </div>

      {/* Notes preview: a muted 1-2 line plain-text snippet, shown only when the
          task has notes. Indented to align under the title. Rich-text HTML is
          stripped to text (never rendered raw) by htmlToPlainText. */}
      {snippet && (
        <p className="line-clamp-2 pl-[1.375rem] pt-0.5 text-[10px] leading-snug text-neutral-400">
          {snippet}
        </p>
      )}

      {/* Footer: compact, muted metadata. Indented to align under the title,
          shrinks/wraps rather than crowding the title above it. */}
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-1 pl-[1.375rem] pt-0.5 text-[10px] leading-none text-neutral-400">
          {task.scheduled_start && (
            <span className="tabular-nums text-neutral-500">
              {task.scheduled_start}
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
