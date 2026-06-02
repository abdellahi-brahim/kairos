import { useState, type CSSProperties, type PointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Task } from "../types";
import { usePlanner } from "../store";
import * as dragCursor from "../lib/dragCursor";
import { BlockCard, blockSurfaceClass } from "./BlockCard";
import {
  DEFAULT_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  snap,
  timeToMinutes,
  topForMinutes,
} from "../lib/timeline";
import { useTimelineWindow } from "./TimelineWindowContext";

export function TimeBlock({ task }: { task: Task }) {
  const editTask = usePlanner((s) => s.editTask);
  const unschedule = usePlanner((s) => s.unscheduleTask);
  const openFocus = usePlanner((s) => s.openFocus);
  const win = useTimelineWindow();

  const startMin = timeToMinutes(task.scheduled_start!);
  const duration = task.estimate_minutes ?? DEFAULT_BLOCK_MIN;

  // Distinct from the list row's sortable id (task.id): a scheduled task exists
  // in both the list and the timeline, and dnd-kit ids must be unique.
  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({ id: `block-${task.id}`, data: { type: "block", task } });

  // Live duration while dragging the resize handle (committed on pointer up).
  const [resizeMin, setResizeMin] = useState<number | null>(null);
  const shownDuration = resizeMin ?? duration;
  // JS hover (WKWebView leaves CSS :hover stuck after pointer interactions).
  const [hovered, setHovered] = useState(false);
  const [handleHover, setHandleHover] = useState(false);

  const onResizeStart = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    // WKWebView will not repaint the pressed element's cursor mid-press, so paint
    // ns-resize document-wide for the whole resize via the global manager.
    dragCursor.begin("resize");
    const move = (ev: globalThis.PointerEvent) => {
      // Size from the absolute pointer delta since start (not accumulated
      // per-event deltas) so coalesced/dropped events don't cause drift.
      const delta = (ev.clientY - startY) / PX_PER_MIN;
      const next = Math.max(
        SNAP_MIN,
        Math.min(snap(duration + delta), win.endMin - startMin),
      );
      setResizeMin(next);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", cancel);
      dragCursor.end();
    };
    const commit = () => {
      cleanup();
      setResizeMin((cur) => {
        if (cur != null && cur !== duration) {
          editTask(task.id, { estimate_minutes: cur });
        }
        return null;
      });
    };
    const cancel = () => {
      cleanup();
      setResizeMin(null); // discard the in-progress resize
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", cancel);
  };

  // Move is rendered by the DragOverlay in PlannerShell; the source node stays
  // put (no transform) so dnd-kit's layout-shift compensation never fights the
  // top/height we own here (which caused an accumulating offset after resizes).
  const onMovePointerDown = (e: PointerEvent) => {
    // Forward to dnd-kit's own pointerdown (we override it to add our handler).
    listeners?.onPointerDown?.(e);
    // Paint the grabbing cursor immediately on press (dnd's onDragStart only
    // fires after the 4px activation distance). Clear it if the press is just a
    // click that never becomes a drag.
    dragCursor.begin("move");
    window.addEventListener("pointerup", () => dragCursor.end(), { once: true });
  };

  const done = task.status === "done";
  const style: CSSProperties = {
    top: topForMinutes(startMin, win),
    height: shownDuration * PX_PER_MIN,
    zIndex: isDragging ? 30 : 10,
  };

  // While dragging, the only visible card is the one moving in the DragOverlay
  // (Google Calendar style: a single card that moves, no placeholder left
  // behind). The source node stays mounted but invisible so dnd-kit keeps its
  // ref/measurements; it is not a second visible card.
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        data-block-id={task.id}
        style={{ ...style, opacity: 0 }}
        className="pointer-events-none absolute left-14 right-2"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-block-id={task.id}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={onMovePointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Drag to move"
      className={
        // Hover affordance only. The active move cursor (grabbing) is painted
        // document-wide by the global drag-cursor manager, because WKWebView
        // will not repaint this element's cursor once the pointer is pressed.
        "absolute left-14 right-2 cursor-grab touch-none select-none overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm " +
        (handleHover ? "ring-1 ring-accent/40 " : "") +
        blockSurfaceClass(done)
      }
    >
      <BlockCard
        task={task}
        durationMin={shownDuration}
        done={done}
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            <button
              aria-label="Focus on this task"
              title="Focus"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openFocus(task.id);
              }}
              className={
                "text-[10px] text-accent/70 hover:text-accent-strong " +
                (hovered ? "opacity-100" : "opacity-0")
              }
            >
              ◎
            </button>
            <button
              aria-label="Remove from timeline"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                unschedule(task.id);
              }}
              className={
                "text-[10px] text-accent/70 hover:text-accent-strong " +
                (hovered ? "opacity-100" : "opacity-0")
              }
            >
              ✕
            </button>
          </span>
        }
      />

      {/* Resize zone: distinct cursor + a grip that appears on hover so it
          reads as "resize" rather than "move". */}
      <div
        onPointerDown={onResizeStart}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        title="Drag edge to resize"
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-0.5"
      >
        {(hovered || handleHover) && (
          <div
            className={
              "h-1 w-6 rounded-full transition-colors " +
              (handleHover ? "bg-accent" : "bg-accent/50")
            }
          />
        )}
      </div>
    </div>
  );
}
