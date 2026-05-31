import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { EstimatePicker } from "./EstimatePicker";

export function TaskItem({
  task,
  bucket,
}: {
  task: Task;
  bucket: "day" | "backlog";
}) {
  const editTask = usePlanner((s) => s.editTask);
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showNotes, setShowNotes] = useState(false);
  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag, so
  // group-hover reveals become unreliable. Pointer events stay reliable.
  const [hovered, setHovered] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", bucket, task } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const done = task.status === "done";

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) {
      editTask(task.id, { title: next });
    } else {
      setTitle(task.title);
    }
    setEditing(false);
  };

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

        {editing ? (
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
            className="flex-1 rounded border border-neutral-300 px-1 py-0.5 text-sm outline-none"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className={
              done
                ? "flex-1 cursor-text text-sm text-neutral-400 line-through"
                : "flex-1 cursor-text text-sm text-neutral-800"
            }
          >
            {task.title}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Fixed-width slots keep the time and estimate columns aligned
              across rows regardless of value width or scheduling. */}
          <div className="flex w-14 justify-end">
            {task.scheduled_start && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-500">
                {task.scheduled_start}
              </span>
            )}
          </div>
          <EstimatePicker
            value={task.estimate_minutes}
            revealed={hovered}
            onChange={(v) => editTask(task.id, { estimate_minutes: v })}
          />
          <button
            aria-label="Toggle notes"
            onClick={() => setShowNotes((s) => !s)}
            className={
              "w-5 rounded text-center text-xs hover:bg-neutral-100 " +
              (task.notes || hovered ? "text-neutral-500" : "text-neutral-400 opacity-0")
            }
          >
            ☰
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

      {showNotes && (
        <textarea
          defaultValue={task.notes ?? ""}
          placeholder="Notes..."
          onBlur={(e) =>
            editTask(task.id, { notes: e.target.value.trim() || null })
          }
          className="mt-1.5 ml-8 w-[calc(100%-2.5rem)] resize-y rounded border border-neutral-200 p-2 text-xs text-neutral-700 outline-none focus:border-neutral-300"
          rows={2}
        />
      )}
    </li>
  );
}
