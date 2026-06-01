import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { prettyDate, relativeLabel, todayKey } from "../lib/date";
import {
  DEFAULT_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  clampStart,
  minutesToTime,
  snap,
  timeToMinutes,
} from "../lib/timeline";
import { DayColumn } from "./DayColumn";
import { TaskItem } from "./TaskItem";
import { AddTask } from "./AddTask";
import { Timeline, type DropPreview } from "./Timeline";
import { BlockCard, blockSurfaceClass } from "./BlockCard";
import * as dragCursor from "../lib/dragCursor";

// While moving a timeline block, lock it to the vertical axis and snap to the
// 15-min grid so the single card jumps in slot increments (the card is the
// preview - no separate drop ghost).
const SNAP_PX = SNAP_MIN * PX_PER_MIN;
const snapBlockToGrid: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
  y: Math.round(transform.y / SNAP_PX) * SNAP_PX,
});

// Drag data attached to a column/inbox task row (TaskItem) or a timeline block
// (TimeBlock). `bucket` distinguishes a planned day row from an inbox row;
// `column` is the day key a row lives in, or "inbox".
interface DragData {
  type: "task" | "block";
  bucket?: "day" | "backlog";
  column?: string;
  task: Task;
}

// Prefer specific drop targets (task rows, timeline slots) over the container
// droppables that wrap them (columns / lists), so reordering resolves to the row
// under the pointer while empty columns and the timeline stay valid drop zones.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const specific = hits.filter((hit) => {
    const container = args.droppableContainers.find((c) => c.id === hit.id);
    const t = container?.data.current?.type;
    return t !== "column" && t !== "list";
  });
  return specific.length > 0 ? specific : hits;
};

// Pixels from the right edge at which to load more future day columns.
const EXTEND_THRESHOLD_PX = 600;

// The pinned Inbox column on the far left (does not scroll with the week strip).
function InboxColumn({ tasks }: { tasks: Task[] }) {
  const addToBacklog = usePlanner((s) => s.addToBacklog);
  const { setNodeRef, isOver } = useDroppable({
    id: "col-inbox",
    data: { type: "column", date: null },
  });

  return (
    <section className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-2 py-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Inbox
        </h2>
      </div>
      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col overflow-y-auto px-1.5 py-1.5 " +
          (isOver ? "bg-indigo-50/60" : "")
        }
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-1.5 text-[11px] text-neutral-300">
            Inbox is empty.
          </p>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-px">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  bucket="backlog"
                  column="inbox"
                />
              ))}
            </ul>
          </SortableContext>
        )}
        <div className="mt-1 px-0.5">
          <AddTask placeholder="+ add to inbox" onAdd={addToBacklog} />
        </div>
      </div>
    </section>
  );
}

// The collapsible right-hand Timeline panel for the selected day.
function TimelinePanel({ preview }: { preview: DropPreview | null }) {
  const selectedDate = usePlanner((s) => s.selectedDate);
  const collapsed = usePlanner((s) => s.timelineCollapsed);
  const toggle = usePlanner((s) => s.toggleTimeline);

  const rel = relativeLabel(selectedDate);
  const label = rel ? `${rel} · ${prettyDate(selectedDate)}` : prettyDate(selectedDate);

  if (collapsed) {
    // A thin rail so the week strip gets full width; the chevron re-expands.
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center border-l border-neutral-200 bg-white">
        <button
          onClick={toggle}
          title="Expand timeline"
          className="flex h-7 w-7 items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-2 py-1">
        <h2 className="truncate text-[11px] font-semibold text-neutral-700">
          {label}
        </h2>
        <button
          onClick={toggle}
          title="Collapse timeline"
          className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ›
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <Timeline preview={preview} />
      </div>
    </aside>
  );
}

export function PlannerShell() {
  const weekDays = usePlanner((s) => s.weekDays);
  const weekTasks = usePlanner((s) => s.weekTasks);
  const weekLoading = usePlanner((s) => s.weekLoading);
  const backlog = usePlanner((s) => s.backlog);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const setDate = usePlanner((s) => s.setDate);
  const loadWeek = usePlanner((s) => s.loadWeek);
  const extendWeek = usePlanner((s) => s.extendWeek);
  const moveTaskWeek = usePlanner((s) => s.moveTaskWeek);
  const reorder = usePlanner((s) => s.reorder);
  const scheduleTask = usePlanner((s) => s.scheduleTask);
  const scheduleOnSelected = usePlanner((s) => s.scheduleOnSelected);

  // Drag overlay state: a list pill (column/inbox row) or a lifted block.
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeBlock, setActiveBlock] = useState<{
    task: Task;
    width: number;
    height: number;
  } | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);

  // Guards against firing overlapping range extensions while one is in flight.
  const extending = useRef(false);
  // The horizontally scrolling day-strip container, so we can bring today into
  // view (the window starts a few days in the past for scroll-left access).
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Scroll today's column to the left edge of the strip once after it loads.
  const scrolledToToday = useRef(false);

  const scrollToToday = () => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-day="${todayKey()}"]`,
    );
    el?.scrollIntoView({ inline: "start", block: "nearest" });
  };

  // Small threshold so taps on a row's controls still register as clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Load the week strip once on mount. dayTasks for the selected day is loaded by
  // App's initial refresh(); selecting a column reloads it via setDate.
  useEffect(() => {
    loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the strip has rendered its columns, bring today to the left edge (the
  // window starts in the past, so today is not the first column). Runs once.
  useEffect(() => {
    if (scrolledToToday.current || weekDays.length === 0) return;
    scrolledToToday.current = true;
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays.length]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const remaining = el.scrollWidth - el.scrollLeft - el.clientWidth;
    if (remaining < EXTEND_THRESHOLD_PX && !extending.current) {
      extending.current = true;
      extendWeek().finally(() => {
        extending.current = false;
      });
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    setActiveTask(data?.type === "task" ? data.task : null);
    if (data?.type === "block") {
      // Height is deterministic from the duration (same formula TimeBlock uses),
      // never from the dnd rect (unreliable at drag start because the source
      // re-renders to the invisible placeholder).
      const duration = data.task.estimate_minutes ?? DEFAULT_BLOCK_MIN;
      const height = duration * PX_PER_MIN;
      const el = document.querySelector<HTMLElement>(
        `[data-block-id="${data.task.id}"]`,
      );
      const width = el?.getBoundingClientRect().width ?? 220;
      setActiveBlock({ task: data.task, width, height });
    }
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
    // Show the dashed landing ghost only when dragging a list/column task onto a
    // timeline slot. A block move shows the moving card itself.
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

    // 1) Moving an existing timeline block: land it by how far the CARD moved
    // (snapped), matching the card's visual snap. Stays on the selected day.
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

    if (!over) return;
    const oData = over.data.current as
      | { type: string; time?: string; date?: string | null; column?: string }
      | undefined;

    // 2) Dropping a column/inbox task onto a timeline slot: schedule it on the
    // SELECTED day at that time (relocating it out of its source column).
    if (oData?.type === "slot" && oData.time && aData.type === "task") {
      scheduleOnSelected(aData.task.id, oData.time);
      return;
    }

    if (aData.type !== "task") return;

    // 3) Otherwise it is a column/inbox interaction: resolve the target column.
    let targetColumn: string;
    if (oData?.type === "column") {
      targetColumn = oData.date == null ? "inbox" : oData.date;
    } else if (oData?.type === "task" && oData.column) {
      targetColumn = oData.column;
    } else {
      return;
    }

    const sourceColumn = aData.column ?? "inbox";

    if (targetColumn !== sourceColumn) {
      // Cross-column move: to a day, or back to the inbox.
      moveTaskWeek(aData.task.id, targetColumn === "inbox" ? null : targetColumn);
      return;
    }

    // Reorder within the same column (only when dropped onto a specific row).
    if (oData?.type === "task") {
      const list =
        sourceColumn === "inbox" ? backlog : weekTasks[sourceColumn] ?? [];
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(Number(active.id));
      const to = ids.indexOf(Number(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        reorder("day", arrayMove(ids, from, to));
      }
    }
  };

  const isToday = selectedDate === todayKey();

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-800">
      {/* Thin top bar: title + a jump-to-today affordance (the week strip and
          column-header selection are the primary navigation now). */}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-1">
        <h1 className="text-[12px] font-semibold tracking-tight text-neutral-700">
          Planner
        </h1>
        <button
          onClick={() => {
            if (!isToday) setDate(todayKey());
            scrollToToday();
          }}
          className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100"
        >
          Jump to today
        </button>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: pinned Inbox (outside the horizontal scroll). */}
          <InboxColumn tasks={backlog} />

          {/* MIDDLE: horizontally scrolling day columns, anchored on today. */}
          <div
            ref={stripRef}
            className="flex-1 overflow-x-auto overflow-y-hidden"
            onScroll={onScroll}
          >
            {weekLoading && weekDays.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-neutral-400">Loading…</p>
            ) : (
              <div className="flex h-full min-w-max">
                {weekDays.map((date) => (
                  <DayColumn
                    key={date}
                    date={date}
                    tasks={weekTasks[date] ?? []}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: collapsible Timeline panel for the selected day. */}
          <TimelinePanel preview={preview} />
        </div>

        <DragOverlay
          dropAnimation={null}
          modifiers={activeBlock ? [snapBlockToGrid] : undefined}
        >
          {activeTask ? (
            <div className="max-w-[14rem] truncate rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[12px] text-neutral-800 shadow-lg">
              {activeTask.title}
            </div>
          ) : activeBlock ? (
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
    </div>
  );
}
