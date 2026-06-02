import { useState } from "react";
import { usePlanner } from "../store";
import { Checkbox } from "./Checkbox";

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
      <h3 className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-muted">
        Subtasks
        {subtasks.length > 0 && (
          <span className="tabular-nums text-muted">
            {doneCount}/{subtasks.length}
          </span>
        )}
      </h3>

      <ul className="flex flex-col">
        {subtasks.map((s) => (
          <li
            key={s.id}
            className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface"
          >
            <Checkbox checked={!!s.done} onChange={() => toggleSubtask(s)} />
            <span
              className={
                "flex-1 text-[14px] " +
                (s.done ? "text-muted line-through" : "text-text")
              }
            >
              {s.title}
            </span>
            <button
              onClick={() => deleteSubtask(s.id)}
              className="text-[10px] text-faint hover:text-alert"
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
        className="mt-1 w-full rounded-md border border-transparent bg-soft px-2 py-1 text-[14px] outline-none focus:border-accent focus:bg-surface-raised"
      />
    </div>
  );
}
