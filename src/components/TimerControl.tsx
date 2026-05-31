import { useEffect, useState } from "react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";

// Shows tracked (actual) time with a start/stop timer. While running, the
// display ticks live; the value is editable by clicking the chip.
export function TimerControl({
  task,
  revealed,
}: {
  task: Task;
  revealed: boolean;
}) {
  const toggleTimer = usePlanner((s) => s.toggleTimer);
  const setActual = usePlanner((s) => s.setActual);
  const running = !!task.timer_started_at;

  // Re-render each second while running so the live time updates.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const liveMinutes = running
    ? task.actual_minutes +
      Math.floor(
        (Date.now() - new Date(task.timer_started_at!).getTime()) / 60000,
      )
    : task.actual_minutes;

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) setActual(task.id, n);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-10 rounded border border-neutral-300 px-1 py-0.5 text-center text-[10px] outline-none"
        />
      ) : liveMinutes > 0 || running ? (
        <button
          title="Tracked time (click to edit)"
          onClick={() => {
            setDraft(String(liveMinutes));
            setEditing(true);
          }}
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums " +
            (running
              ? "bg-emerald-100 text-emerald-700"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100")
          }
        >
          {formatDuration(liveMinutes)}
        </button>
      ) : null}

      <button
        aria-label={running ? "Stop timer" : "Start timer"}
        onClick={() => toggleTimer(task)}
        className={
          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] " +
          (running
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "text-neutral-400 hover:bg-neutral-100 " +
              (revealed ? "opacity-100" : "opacity-0"))
        }
      >
        {running ? "■" : "▶"}
      </button>
    </div>
  );
}
