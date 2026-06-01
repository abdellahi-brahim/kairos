import { useState } from "react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags, tagColor } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";
import { Checkbox } from "./Checkbox";

// A dense, read-only row for a column's collapsed "Done" group. Visually mirrors
// TaskItem's done state but deliberately does NOT register a dnd sortable: done
// rows live outside the open SortableContext, yet a plain TaskItem would still
// call useSortable inside the shared DndContext. Keeping this presentational
// avoids that and keeps drag/drop clean. The checkbox re-opens the task via
// toggleComplete; the title still opens the detail modal.
export function DoneRow({ task }: { task: Task }) {
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);
  const openDetail = usePlanner((s) => s.openDetail);

  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);

  const running = !!task.timer_started_at;
  const tags = parseTags(task.tags);
  const open = () => openDetail(task.id);
  const snippet = htmlToPlainText(task.notes);
  const meta = priorityMeta(task.priority);

  // Priority left rail, kept consistent with the open rows. border-left-color is
  // more specific than the hover border-color swap, so the rail survives hover.
  const railClass = task.priority > 0 ? " border-l-2 " + meta.rail : "";

  const hasMeta =
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
        (hovered ? "border-neutral-300 shadow-sm" : "border-neutral-200") +
        railClass
      }
    >
      <div className="flex items-start gap-1.5">
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox checked onChange={() => toggleComplete(task)} />
        </span>

        <button
          onClick={open}
          title={task.title}
          className="min-w-0 flex-1 line-clamp-3 text-left text-[13px] font-medium leading-5 text-neutral-400 line-through"
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

      {snippet && (
        <p className="line-clamp-2 pl-[1.375rem] pt-0.5 text-[11px] leading-snug text-neutral-400">
          {snippet}
        </p>
      )}

      {hasMeta && (
        <div className="flex flex-wrap items-center gap-1 pl-[1.375rem] pt-0.5 text-[11px] leading-none text-neutral-400">
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
