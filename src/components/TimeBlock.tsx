import { useState, type CSSProperties, type PointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { formatDuration } from "../lib/date";
import {
  DAY_END_MIN,
  DEFAULT_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  minutesToTime,
  snap,
  timeToMinutes,
  topForMinutes,
} from "../lib/timeline";

export function TimeBlock({ task }: { task: Task }) {
  const editTask = usePlanner((s) => s.editTask);
  const unschedule = usePlanner((s) => s.unscheduleTask);

  const startMin = timeToMinutes(task.scheduled_start!);
  const duration = task.estimate_minutes ?? DEFAULT_BLOCK_MIN;

  // Distinct from the list row's sortable id (task.id): a scheduled task exists
  // in both the list and the timeline, and dnd-kit ids must be unique.
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `block-${task.id}`, data: { type: "block", task } });

  // Live duration while dragging the resize handle (committed on pointer up).
  const [resizeMin, setResizeMin] = useState<number | null>(null);
  const shownDuration = resizeMin ?? duration;
  // JS hover (WKWebView leaves CSS :hover stuck after pointer interactions).
  const [hovered, setHovered] = useState(false);

  const onResizeStart = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const move = (ev: globalThis.PointerEvent) => {
      const delta = (ev.clientY - startY) / PX_PER_MIN;
      const next = Math.max(
        SNAP_MIN,
        Math.min(snap(duration + delta), DAY_END_MIN - startMin),
      );
      setResizeMin(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizeMin((cur) => {
        if (cur != null && cur !== duration) {
          editTask(task.id, { estimate_minutes: cur });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const done = task.status === "done";
  const style: CSSProperties = {
    top: topForMinutes(startMin),
    height: shownDuration * PX_PER_MIN,
    transform: CSS.Translate.toString(transform),
    // Move the real block so its size/proportion is preserved while dragging.
    opacity: isDragging ? 0.75 : 1,
    zIndex: isDragging ? 30 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "absolute left-14 right-2 cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm " +
        (done
          ? "border-neutral-200 bg-neutral-100 text-neutral-400"
          : "border-indigo-200 bg-indigo-50 text-indigo-900")
      }
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={
            "truncate text-xs font-medium " + (done ? "line-through" : "")
          }
        >
          {task.title}
        </span>
        <button
          aria-label="Remove from timeline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            unschedule(task.id);
          }}
          className={
            "shrink-0 text-[10px] text-indigo-400 hover:text-indigo-700 " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          ✕
        </button>
      </div>
      {shownDuration >= 30 && (
        <div className="text-[10px] opacity-70">
          {minutesToTime(startMin)}–{minutesToTime(startMin + shownDuration)} ·{" "}
          {formatDuration(shownDuration)}
        </div>
      )}

      <div
        onPointerDown={onResizeStart}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      />
    </div>
  );
}
