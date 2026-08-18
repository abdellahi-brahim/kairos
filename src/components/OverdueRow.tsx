import { useState } from "react";
import { ListChecks, MoveRight, Paperclip } from "lucide-react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration, todayKey } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";
import { Checkbox } from "./Checkbox";
import { TagChip } from "./TagChip";

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

  // Priority left rail, matching the main task rows.
  const railClass = task.priority > 0 ? " border-l-2 " + meta.rail : "";

  const restTag = tags[0];
  const hasRestMeta = daysLate > 0 || running || !!restTag;
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
        "rounded-md border border-transparent bg-transparent px-2.5 py-2 transition-colors duration-100 ease-out " +
        (hovered ? "bg-alert-soft/70" : "") +
        railClass
      }
    >
      <div className="flex items-start gap-2">
        <span className="flex h-5 shrink-0 items-center">
          <Checkbox checked={done} onChange={() => toggleComplete(task)} />
        </span>

        <button
          onClick={open}
          title={task.title}
          className={
            "min-w-0 flex-1 line-clamp-3 text-left text-[14px] font-medium leading-5 " +
            (done ? "text-muted line-through" : "text-text")
          }
        >
          {task.title}
        </button>

        <button
          onClick={() => moveToToday(task.id)}
          title="Move to today"
          className={
            "flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[11px] font-medium leading-none text-alert hover:bg-alert-soft " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          <MoveRight className="h-3.5 w-3.5" />
          Today
        </button>
      </div>

      {snippet && (
        <p className="line-clamp-2 pl-7 pt-1 text-[12px] leading-snug text-muted">
          {snippet}
        </p>
      )}

      {showFooter && (
        <div className="flex flex-wrap items-center gap-2 pl-7 pt-1 text-[12px] leading-none text-muted">
          {daysLate > 0 && (
            <span
              title="How long this task is overdue"
              className="font-medium tabular-nums text-alert"
            >
              {daysLate}d late
            </span>
          )}
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
                  className="inline-flex items-center gap-1 tabular-nums text-muted hover:text-text"
                >
                  <ListChecks className="h-3 w-3" />
                  {task.subtask_done ?? 0}/{task.subtask_total}
                </button>
              )}
              {!!task.attachment_count && task.attachment_count > 0 && (
                <button
                  onClick={open}
                  title="Attachments"
                  className="inline-flex items-center gap-1 tabular-nums text-muted hover:text-text"
                >
                  <Paperclip className="h-3 w-3" />
                  {task.attachment_count}
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
