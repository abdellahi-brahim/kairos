import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags, tagColor } from "../lib/tags";

// A dense, title-first task row shared by every column (Inbox + day columns).
//
// Layout: a title line where the title always wins for space (it truncates LAST,
// never to "F..."), preceded only by the small fixed-width controls (drag
// handle, checkbox, priority dot). All secondary metadata (scheduled time,
// estimate, tags, tracked time, subtasks) lives on a compact, de-emphasized
// second footer line that wraps/shrinks instead of stealing the title's width.
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
        "rounded border px-1 py-0.5 " +
        (hovered ? "border-neutral-200 bg-white" : "border-transparent")
      }
    >
      {/* Title line: controls are fixed-width, the title flex-grows + truncates. */}
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={
            "shrink-0 cursor-grab text-[11px] leading-none text-neutral-300 transition-opacity " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ⠿
        </button>

        <input
          type="checkbox"
          checked={done}
          onChange={() => toggleComplete(task)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-indigo-500"
        />

        {task.priority > 0 && (
          <span
            title={`${priorityMeta(task.priority).label} priority`}
            className={
              "h-1.5 w-1.5 shrink-0 rounded-full " +
              priorityMeta(task.priority).dot
            }
          />
        )}

        <button
          onClick={open}
          title={task.title}
          className={
            "min-w-0 flex-1 truncate text-left text-[13px] leading-5 " +
            (done ? "text-neutral-400 line-through" : "text-neutral-800")
          }
        >
          {task.title}
        </button>

        <button
          aria-label="Delete task"
          onClick={() => removeTask(task.id)}
          className={
            "shrink-0 rounded px-1 text-[11px] leading-none text-neutral-400 hover:bg-red-50 hover:text-red-500 " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ✕
        </button>
      </div>

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
