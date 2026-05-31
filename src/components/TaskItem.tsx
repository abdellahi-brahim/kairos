import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags, tagColor } from "../lib/tags";

export function TaskItem({
  task,
  bucket,
}: {
  task: Task;
  bucket: "day" | "backlog";
}) {
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);
  const openDetail = usePlanner((s) => s.openDetail);

  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", bucket, task } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const done = task.status === "done";
  const running = !!task.timer_started_at;
  const tags = parseTags(task.tags);
  const open = () => openDetail(task.id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "rounded-lg border bg-white px-1.5 py-1.5 " +
        (hovered ? "border-neutral-200 shadow-sm" : "border-transparent")
      }
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={
            "cursor-grab text-neutral-300 transition-opacity " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ⠿
        </button>

        <input
          type="checkbox"
          checked={done}
          onChange={() => toggleComplete(task)}
          className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
        />

        {task.priority > 0 && (
          <span
            title={`${priorityMeta(task.priority).label} priority`}
            className={
              "h-2 w-2 shrink-0 rounded-full " + priorityMeta(task.priority).dot
            }
          />
        )}

        <button
          onClick={open}
          title="Open details"
          className={
            "flex-1 truncate text-left text-sm " +
            (done ? "text-neutral-400 line-through" : "text-neutral-800")
          }
        >
          {task.title}
        </button>

        <div className="ml-auto flex items-center gap-1">
          {tags.slice(0, 2).map((t) => (
            <button
              key={t}
              onClick={open}
              className={
                "rounded px-1.5 py-0.5 text-[10px] font-medium " + tagColor(t)
              }
            >
              {t}
            </button>
          ))}
          {tags.length > 2 && (
            <span className="text-[10px] text-neutral-400">
              +{tags.length - 2}
            </span>
          )}
          {running && (
            <span
              title="Timer running"
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            />
          )}
          {task.actual_minutes > 0 && (
            <button
              onClick={open}
              title="Tracked time"
              className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-600"
            >
              {formatDuration(task.actual_minutes)}
            </button>
          )}
          {!!task.subtask_total && task.subtask_total > 0 && (
            <button
              onClick={open}
              title="Subtasks"
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-500"
            >
              ☑ {task.subtask_done ?? 0}/{task.subtask_total}
            </button>
          )}

          {/* Fixed-width time + estimate columns keep rows aligned. */}
          <div className="flex w-14 justify-end">
            {task.scheduled_start && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-500">
                {task.scheduled_start}
              </span>
            )}
          </div>
          <button
            onClick={open}
            title="Estimate"
            className={
              task.estimate_minutes != null
                ? "block w-11 rounded-md bg-indigo-50 px-1.5 py-0.5 text-center text-xs font-medium text-indigo-600"
                : "block w-11 rounded-md px-1.5 py-0.5 text-center text-xs text-neutral-400 " +
                  (hovered ? "opacity-100" : "opacity-0")
            }
          >
            {task.estimate_minutes != null
              ? formatDuration(task.estimate_minutes)
              : "+ est"}
          </button>

          <button
            aria-label="Delete task"
            onClick={() => removeTask(task.id)}
            className={
              "w-5 rounded text-center text-xs text-neutral-400 hover:bg-red-50 hover:text-red-500 " +
              (hovered ? "opacity-100" : "opacity-0")
            }
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}
