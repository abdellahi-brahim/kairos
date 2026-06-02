import { useState } from "react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";
import { Checkbox } from "./Checkbox";
import { TagChip } from "./TagChip";

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

  const restTag = tags[0];
  const hasRestMeta = running || !!restTag;
  const hasHoverExtra =
    task.estimate_minutes != null ||
    task.actual_minutes > 0 ||
    (!!task.subtask_total && task.subtask_total > 0) ||
    (!!task.attachment_count && task.attachment_count > 0) ||
    tags.length > 1;
  const showFooter = hasRestMeta || (hovered && hasHoverExtra);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "rounded-md border bg-surface-raised px-3 py-2 transition-shadow duration-150 ease-out " +
        (hovered ? "border-hairline shadow-sm" : "border-transparent") +
        railClass
      }
    >
      <div className="flex items-start gap-2">
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox checked onChange={() => toggleComplete(task)} />
        </span>

        <button
          onClick={open}
          title={task.title}
          className="min-w-0 flex-1 line-clamp-3 text-left text-[14px] font-medium leading-5 text-muted line-through"
        >
          {task.title}
        </button>

        <button
          aria-label="Delete task"
          onClick={() => removeTask(task.id)}
          className={
            "flex h-5 shrink-0 items-center rounded px-1 text-[11px] leading-none text-muted hover:bg-alert-soft hover:text-alert " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ✕
        </button>
      </div>

      {snippet && (
        <p className="line-clamp-2 pl-7 pt-1 text-[12px] leading-snug text-muted">
          {snippet}
        </p>
      )}

      {showFooter && (
        <div className="flex flex-wrap items-center gap-2 pl-7 pt-1 text-[12px] leading-none text-muted">
          {running && (
            <span
              title="Timer running"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
          )}
          {restTag && <TagChip name={restTag} onClick={open} />}

          {hovered && (
            <>
              {task.estimate_minutes != null && (
                <button
                  onClick={open}
                  title="Estimate"
                  className="tabular-nums text-muted hover:text-text"
                >
                  {formatDuration(task.estimate_minutes)}
                </button>
              )}
              {task.actual_minutes > 0 && (
                <button
                  onClick={open}
                  title="Tracked time"
                  className="tabular-nums text-muted hover:text-text"
                >
                  {formatDuration(task.actual_minutes)} tracked
                </button>
              )}
              {!!task.subtask_total && task.subtask_total > 0 && (
                <button
                  onClick={open}
                  title="Subtasks"
                  className="tabular-nums text-muted hover:text-text"
                >
                  ☑ {task.subtask_done ?? 0}/{task.subtask_total}
                </button>
              )}
              {!!task.attachment_count && task.attachment_count > 0 && (
                <button
                  onClick={open}
                  title="Attachments"
                  className="tabular-nums text-muted hover:text-text"
                >
                  📎 {task.attachment_count}
                </button>
              )}
              {tags.slice(1).map((t) => (
                <TagChip key={t} name={t} onClick={open} />
              ))}
            </>
          )}
        </div>
      )}
    </li>
  );
}
