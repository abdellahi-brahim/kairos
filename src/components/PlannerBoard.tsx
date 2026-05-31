import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Task } from "../types";
import { usePlanner } from "../store";
import {
  DEFAULT_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  clampStart,
  minutesToTime,
  snap,
  timeToMinutes,
} from "../lib/timeline";

// While moving a block, lock it to the vertical axis and snap it to the 15-min
// grid, so the single card jumps in slot increments as you drag (the card is
// the preview - no separate drop ghost).
const SNAP_PX = SNAP_MIN * PX_PER_MIN;
const snapBlockToGrid: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
  y: Math.round(transform.y / SNAP_PX) * SNAP_PX,
});
import { todayKey } from "../lib/date";
import { TaskList } from "./TaskList";
import { AddTask } from "./AddTask";
import { CarryOverStrip } from "./CarryOverStrip";
import { Timeline, type DropPreview } from "./Timeline";
import { BlockCard, blockSurfaceClass } from "./BlockCard";
import * as dragCursor from "../lib/dragCursor";

interface DragData {
  type: "task" | "block";
  bucket?: "day" | "backlog";
  task: Task;
}

// Prefer specific drop targets (task rows, timeline slots) over the list
// containers that wrap them, so reordering still resolves to the row under the
// pointer while empty lists remain valid drop zones.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const specific = hits.filter((hit) => {
    const container = args.droppableContainers.find((c) => c.id === hit.id);
    return container?.data.current?.type !== "list";
  });
  return specific.length > 0 ? specific : hits;
};

export function PlannerBoard() {
  const dayTasks = usePlanner((s) => s.dayTasks);
  const backlog = usePlanner((s) => s.backlog);
  const loading = usePlanner((s) => s.loading);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const addToDay = usePlanner((s) => s.addToDay);
  const addToBacklog = usePlanner((s) => s.addToBacklog);
  const reorder = usePlanner((s) => s.reorder);
  const scheduleTask = usePlanner((s) => s.scheduleTask);
  const moveTask = usePlanner((s) => s.moveTask);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeBlock, setActiveBlock] = useState<{
    task: Task;
    width: number;
    height: number;
  } | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);

  // Small threshold so taps on a row's controls still register as clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const open = dayTasks.filter((t) => t.status !== "done");
  const doneCount = dayTasks.length - open.length;

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    // List rows and timeline blocks both render through the DragOverlay so the
    // real nodes are never transformed (blocks own their own top/height).
    setActiveTask(data?.type === "task" ? data.task : null);
    if (data?.type === "block") {
      // Height is deterministic from the duration (same formula TimeBlock uses),
      // never from the dnd rect (which is unreliable at drag start because the
      // source re-renders to the invisible placeholder and would collapse the
      // overlay to the tiny fallback size).
      const duration = data.task.estimate_minutes ?? DEFAULT_BLOCK_MIN;
      const height = duration * PX_PER_MIN;
      // Width is the real timeline column width. Measure the rendered block
      // element (the invisible placeholder still spans `left-14 right-2`, so its
      // width is correct even on the first drag).
      const el = document.querySelector<HTMLElement>(
        `[data-block-id="${data.task.id}"]`,
      );
      const width = el?.getBoundingClientRect().width ?? 220;
      setActiveBlock({ task: data.task, width, height });
    }
    // WKWebView will not repaint the pressed element's cursor mid-drag, so a
    // global cursor manager paints `grabbing` document-wide for the whole move.
    dragCursor.begin("move");
  };

  const endDrag = () => {
    setActiveTask(null);
    setActiveBlock(null);
    setPreview(null);
    dragCursor.end();
  };

  const onDragOver = (e: DragOverEvent) => {
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as { type?: string; time?: string } | undefined;
    // Only show the dashed landing ghost when dragging a task IN from a list
    // (its overlay is a small pill). A block move shows the moving card itself,
    // so no separate ghost.
    if (a?.type === "task" && o?.type === "slot" && o.time) {
      setPreview({
        time: o.time,
        durationMin: a.task.estimate_minutes ?? DEFAULT_BLOCK_MIN,
      });
    } else {
      setPreview(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    endDrag();
    const { active, over, delta } = e;
    const aData = active.data.current as DragData | undefined;
    if (!aData) return;

    // Moving an existing block: land it by how far the CARD moved (snapped),
    // matching the card's visual snap. Using the slot under the pointer would
    // be off by wherever within the card you grabbed it.
    if (aData.type === "block") {
      const startMin = timeToMinutes(aData.task.scheduled_start!);
      const duration = aData.task.estimate_minutes ?? DEFAULT_BLOCK_MIN;
      const newStart = clampStart(
        snap(startMin + delta.y / PX_PER_MIN),
        duration,
      );
      scheduleTask(aData.task.id, minutesToTime(newStart));
      return;
    }

    const oData = over?.data.current as
      | { type: string; time?: string; bucket?: "day" | "backlog" }
      | undefined;
    if (!over) return;

    // Dropping a task IN from a list onto a timeline slot.
    if (oData?.type === "slot" && oData.time) {
      scheduleTask(aData.task.id, oData.time);
      return;
    }

    // Dropped on a list. Onto another bucket → move; onto a row → reorder or
    // cross-bucket move depending on whether the buckets match.
    const targetBucket =
      oData?.type === "list"
        ? oData.bucket
        : oData?.type === "task"
          ? (over.data.current as DragData).bucket
          : undefined;
    if (!targetBucket || aData.type !== "task" || !aData.bucket) return;

    if (targetBucket !== aData.bucket) {
      moveTask(aData.task.id, targetBucket === "day" ? selectedDate : null);
      return;
    }

    // Reorder within the same list (only when dropped onto a specific row).
    if (oData?.type === "task") {
      const list = aData.bucket === "day" ? dayTasks : backlog;
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(Number(active.id));
      const to = ids.indexOf(Number(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        reorder(aData.bucket, arrayMove(ids, from, to));
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Planning panel */}
        <section className="flex w-[440px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 px-4 py-4">
          {selectedDate === todayKey() && <CarryOverStrip />}

          <div className="mb-1 flex items-baseline justify-between px-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              This day
            </h2>
            <span className="text-xs text-neutral-400">
              {open.length} open{doneCount > 0 ? ` · ${doneCount} done` : ""}
            </span>
          </div>

          {loading ? (
            <p className="px-2 py-3 text-sm text-neutral-400">Loading…</p>
          ) : (
            <TaskList
              bucket="day"
              tasks={dayTasks}
              emptyText="No tasks yet. Add one below or pull from the inbox."
            />
          )}

          <div className="mt-2 px-1">
            <AddTask placeholder="Add a task for this day…" onAdd={addToDay} />
          </div>

          <div className="my-4 border-t border-neutral-200" />

          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Inbox
          </h2>
          <TaskList bucket="backlog" tasks={backlog} emptyText="Inbox is empty." />
          <div className="mt-2 px-1">
            <AddTask placeholder="Add to inbox…" onAdd={addToBacklog} />
          </div>
        </section>

        {/* Timeline */}
        <section className="flex-1 overflow-y-auto px-6 py-4">
          <Timeline preview={preview} />
        </section>
      </div>

      <DragOverlay
        dropAnimation={null}
        modifiers={activeBlock ? [snapBlockToGrid] : undefined}
      >
        {activeTask ? (
          <div className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-800 shadow-lg">
            {activeTask.title}
          </div>
        ) : activeBlock ? (
          // The same block, just moving: identical surface/padding/radius/content
          // as the resting card, with only a soft shadow to feel picked up.
          <div
            style={{ width: activeBlock.width, height: activeBlock.height }}
            className={
              "overflow-hidden rounded-md border px-2 py-1 text-left shadow-lg " +
              blockSurfaceClass(activeBlock.task.status === "done")
            }
          >
            <BlockCard
              task={activeBlock.task}
              durationMin={
                activeBlock.task.estimate_minutes ?? DEFAULT_BLOCK_MIN
              }
              done={activeBlock.task.status === "done"}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
