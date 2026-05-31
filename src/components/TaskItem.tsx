import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { EstimatePicker } from "./EstimatePicker";

export function TaskItem({ task }: { task: Task }) {
  const editTask = usePlanner((s) => s.editTask);
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showNotes, setShowNotes] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
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
      className="group rounded-lg border border-transparent bg-white px-1.5 py-1.5 hover:border-neutral-200 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab text-neutral-300 opacity-0 group-hover:opacity-100"
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

        <div className="ml-auto flex items-center gap-0.5">
          <EstimatePicker
            value={task.estimate_minutes}
            onChange={(v) => editTask(task.id, { estimate_minutes: v })}
          />
          <button
            aria-label="Toggle notes"
            onClick={() => setShowNotes((s) => !s)}
            className={
              task.notes
                ? "rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100"
                : "rounded px-1 text-xs text-neutral-400 opacity-0 hover:bg-neutral-100 group-hover:opacity-100"
            }
          >
            ☰
          </button>
          <button
            aria-label="Delete task"
            onClick={() => removeTask(task.id)}
            className="rounded px-1 text-xs text-neutral-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
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
