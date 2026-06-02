import { useEffect, useState } from "react";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";

// Tracked (actual) time display. Time is now recorded automatically by a Focus
// (Zen) session, so there is no manual start/stop here; this just shows the
// tracked value and lets you click to edit it. While a session is running the
// display ticks live.
export function TimerControl({ task }: { task: Task }) {
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

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-10 rounded border border-hairline px-1 py-0.5 text-center text-[12px] outline-none"
      />
    );
  }

  return (
    <button
      title="Tracked time (click to edit)"
      onClick={() => {
        setDraft(String(liveMinutes));
        setEditing(true);
      }}
      className={
        "rounded px-1.5 py-0.5 text-[12px] tabular-nums " +
        (running
          ? "bg-accent-soft font-medium text-accent"
          : "text-muted hover:bg-accent-faint hover:text-text")
      }
    >
      {formatDuration(liveMinutes)}
    </button>
  );
}
