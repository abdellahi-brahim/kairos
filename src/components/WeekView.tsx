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
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { DateNav } from "./DateNav";
import { ViewToggle } from "./ViewToggle";
import { DayColumn } from "./DayColumn";
import { TaskItem } from "./TaskItem";
import { AddTask } from "./AddTask";
import * as dragCursor from "../lib/dragCursor";

// Drag data attached to a Week-view task row (see TaskItem). `column` is the
// day key the row currently lives in, or "inbox".
interface WeekDragData {
  type: "task";
  bucket: "day" | "backlog";
  column?: string;
  task: Task;
}

// Prefer the specific drop target (a task row, for reordering) over the column
// container that wraps it, while keeping empty columns valid drop zones.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const specific = hits.filter((hit) => {
    const container = args.droppableContainers.find((c) => c.id === hit.id);
    return container?.data.current?.type !== "column";
  });
  return specific.length > 0 ? specific : hits;
};

// Pixels from the right edge at which to load more future days.
const EXTEND_THRESHOLD_PX = 600;

function InboxColumn({ tasks }: { tasks: Task[] }) {
  const addToBacklog = usePlanner((s) => s.addToBacklog);
  const { setNodeRef, isOver } = useDroppable({
    id: "col-inbox",
    data: { type: "column", date: null },
  });

  return (
    // Pinned on the left: does not participate in the horizontal scroll.
    <section className="flex w-[320px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Inbox
        </h2>
      </div>
      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col overflow-y-auto px-2 py-2 " +
          (isOver ? "bg-indigo-50/60" : "")
        }
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-300">Inbox is empty.</p>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-0.5">
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
        <div className="mt-2 px-0.5">
          <AddTask placeholder="Add to inbox…" onAdd={addToBacklog} />
        </div>
      </div>
    </section>
  );
}

export function WeekView() {
  const weekDays = usePlanner((s) => s.weekDays);
  const weekTasks = usePlanner((s) => s.weekTasks);
  const weekLoading = usePlanner((s) => s.weekLoading);
  const backlog = usePlanner((s) => s.backlog);
  const loadWeek = usePlanner((s) => s.loadWeek);
  const extendWeek = usePlanner((s) => s.extendWeek);
  const moveTaskWeek = usePlanner((s) => s.moveTaskWeek);
  const reorder = usePlanner((s) => s.reorder);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Guards against firing overlapping range extensions while one is in flight.
  const extending = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Reload the initial window whenever the Week view mounts, so it reflects any
  // edits made in the Day view (which only refreshes the Day buckets). In-view
  // drags/adds keep the map consistent through the store's optimistic helpers,
  // so this fires only on entry, not on every change.
  useEffect(() => {
    loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const data = e.active.data.current as WeekDragData | undefined;
    setActiveTask(data?.task ?? null);
    dragCursor.begin("move");
  };

  const endDrag = () => {
    setActiveTask(null);
    dragCursor.end();
  };

  const onDragEnd = (e: DragEndEvent) => {
    endDrag();
    const { active, over } = e;
    if (!over) return;
    const aData = active.data.current as WeekDragData | undefined;
    if (!aData || aData.type !== "task") return;

    const oData = over.data.current as
      | { type: string; date?: string | null; column?: string }
      | undefined;

    // Resolve the target column: dropping on a column container uses its date;
    // dropping on a task row uses that row's column.
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

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-800">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <ViewToggle />
          <DateNav />
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Pinned Inbox: outside the horizontal scroll container. */}
          <InboxColumn tasks={backlog} />

          {/* Horizontally scrolling day columns, anchored on today. */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden" onScroll={onScroll}>
            {weekLoading && weekDays.length === 0 ? (
              <p className="px-6 py-4 text-sm text-neutral-400">Loading…</p>
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
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-800 shadow-lg">
              {activeTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
