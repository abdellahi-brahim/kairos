import { useState } from "react";
import { usePlanner } from "../store";

export function SubtaskList() {
  const subtasks = usePlanner((s) => s.detailSubtasks);
  const addSubtask = usePlanner((s) => s.addSubtask);
  const toggleSubtask = usePlanner((s) => s.toggleSubtask);
  const deleteSubtask = usePlanner((s) => s.deleteSubtask);

  const [title, setTitle] = useState("");
  const doneCount = subtasks.filter((s) => s.done).length;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    addSubtask(t);
    setTitle("");
  };

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Subtasks
        {subtasks.length > 0 && (
          <span className="font-medium tabular-nums text-neutral-400">
            {doneCount}/{subtasks.length}
          </span>
        )}
      </h3>

      <ul className="flex flex-col">
        {subtasks.map((s) => (
          <li
            key={s.id}
            className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-neutral-50"
          >
            <input
              type="checkbox"
              checked={!!s.done}
              onChange={() => toggleSubtask(s)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
            />
            <span
              className={
                "flex-1 text-sm " +
                (s.done ? "text-neutral-400 line-through" : "text-neutral-700")
              }
            >
              {s.title}
            </span>
            <button
              onClick={() => deleteSubtask(s.id)}
              className="text-[10px] text-neutral-300 hover:text-red-500"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Add a subtask…"
        className="mt-1 w-full rounded-md border border-transparent bg-neutral-100 px-2 py-1.5 text-sm outline-none focus:border-neutral-300 focus:bg-white"
      />
    </div>
  );
}
