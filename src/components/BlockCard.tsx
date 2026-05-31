import type { ReactNode } from "react";
import type { Task } from "../types";
import { formatDuration } from "../lib/date";
import { minutesToTime, timeToMinutes } from "../lib/timeline";

// Inner visual of a scheduled timeline block. Shared by the real, interactive
// TimeBlock and the DragOverlay so the floating block reads as the same block
// "lifted", not a different-colored box. Callers own the positioned wrapper
// (top/height, refs, listeners); this only paints the chrome and content.
//
// `done` toggles the muted/strike-through styling. `trailing` lets the
// interactive block slot in its ✕ button while the overlay passes nothing.
export function BlockCard({
  task,
  durationMin,
  done,
  trailing,
}: {
  task: Task;
  durationMin: number;
  done: boolean;
  trailing?: ReactNode;
}) {
  const startMin = timeToMinutes(task.scheduled_start!);
  return (
    <>
      <div className="flex items-start justify-between gap-1">
        <span
          className={
            "truncate text-xs font-medium " + (done ? "line-through" : "")
          }
        >
          {task.title}
        </span>
        {trailing}
      </div>
      {durationMin >= 30 && (
        <div className="text-[10px] opacity-70">
          {minutesToTime(startMin)}–{minutesToTime(startMin + durationMin)} ·{" "}
          {formatDuration(durationMin)}
        </div>
      )}
    </>
  );
}

// Tailwind classes for the block's surface (border, bg, text). Shared so the
// overlay and the resting block stay in lockstep when colors change.
export function blockSurfaceClass(done: boolean): string {
  return done
    ? "border-neutral-200 bg-neutral-100 text-neutral-400"
    : "border-indigo-200 bg-indigo-50 text-indigo-900";
}
