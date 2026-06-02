import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
import {
  usePlanner,
  INBOX_DEFAULT_WIDTH,
  TIMELINE_DEFAULT_WIDTH,
} from "../store";
import { formatDuration, prettyDate, relativeLabel, shiftDay, todayKey } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import {
  DEFAULT_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  clampStart,
  computeWindow,
  minutesToTime,
  snap,
  timeToMinutes,
} from "../lib/timeline";
import { DayColumn } from "./DayColumn";
import { TaskItem } from "./TaskItem";
import { AddTask } from "./AddTask";
import { Timeline, type DropPreview } from "./Timeline";
import { BlockCard, blockSurfaceClass } from "./BlockCard";
import { InsertionContext, type Insertion } from "./InsertionContext";
import { TimelineWindowContext } from "./TimelineWindowContext";
import * as dragCursor from "../lib/dragCursor";

// While moving a timeline block, lock it to the vertical axis. By default we
// snap to the 15-min grid so the single card jumps in slot increments (the card
// is the preview - no separate drop ghost). Holding Alt/Option bypasses the snap
// for fine 1px = 1min placement; the modifier reads live Alt state from a ref so
// the preview tracks the key without restarting the drag.
const SNAP_PX = SNAP_MIN * PX_PER_MIN;

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

// Current local minute-of-day (hours*60 + minutes).
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// Pick the task to start a "Focus day" run on, from today's tasks. Considers
// only scheduled, not-done tasks: prefers the block containing the current time
// (earliest start on overlap), else the earliest by start. Returns null when
// nothing today is both scheduled and open (the button then disables).
function pickFocusDayStart(tasks: Task[]): number | null {
  const candidates = tasks
    .filter((t) => t.scheduled_start != null && t.status !== "done")
    .sort(
      (a, b) =>
        timeToMinutes(a.scheduled_start!) - timeToMinutes(b.scheduled_start!),
    );
  if (candidates.length === 0) return null;
  const nowMin = nowMinutes();
  for (const t of candidates) {
    const start = timeToMinutes(t.scheduled_start!);
    const end = start + (t.estimate_minutes ?? DEFAULT_BLOCK_MIN);
    if (start <= nowMin && nowMin < end) return t.id;
  }
  return candidates[0].id;
}

// A thin vertical drag handle that sits on a panel's inner edge and resizes it.
// It is a PLAIN pointer handler, not a dnd-kit node: stopPropagation +
// preventDefault on pointerdown keep the DndContext PointerSensor from ever
// starting a drag from it. Sizing mirrors TimeBlock's resize: record the start
// clientX + the panel's current width, then size from the ABSOLUTE pointer
// delta since start (not accumulated per-event deltas) so coalesced/dropped
// events never drift. `side` says which edge the handle is on, which sets the
// delta sign: the Inbox grows when its right edge moves right (+), the Timeline
// grows when its left edge moves left (-). `onResizingChange` lets the panel
// suppress its width transition for the duration of the live drag.
function PanelSplitter({
  side,
  width,
  setWidth,
  defaultWidth,
  onResizingChange,
}: {
  side: "right" | "left";
  width: number;
  setWidth: (px: number) => void;
  defaultWidth: number;
  onResizingChange: (resizing: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const onPointerDown = (e: PointerEvent) => {
    // Block the dnd-kit PointerSensor and any default text-selection drag.
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    onResizingChange(true);
    dragCursor.begin("resize-col");
    const move = (ev: globalThis.PointerEvent) => {
      const delta = ev.clientX - startX;
      // Inbox (handle on the right): drag right grows it. Timeline (handle on
      // the left): drag left grows it, so the sign is inverted. The store
      // setter clamps to the panel's allowed range.
      const next = side === "right" ? startWidth + delta : startWidth - delta;
      setWidth(next);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      dragCursor.end();
      onResizingChange(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={() => setWidth(defaultWidth)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Drag to resize (double-click to reset)"
      className={
        "absolute inset-y-0 z-20 flex w-1.5 cursor-col-resize touch-none select-none justify-center " +
        (side === "right" ? "-right-0.5" : "-left-0.5")
      }
    >
      {/* Faint accent line revealed on JS hover (CSS :hover sticks in WKWeb
          WebView after a drag), matching the timeline's hover affordances. */}
      <div
        className={
          "h-full w-px bg-accent transition-opacity " +
          (hovered ? "opacity-100" : "opacity-0")
        }
      />
    </div>
  );
}

// The pinned Inbox column on the far left (does not scroll with the week strip).
// Collapsible (mirrors TimelinePanel) and resizable from its right edge. The
// width animates on collapse/expand but the transition is suppressed during a
// live splitter drag so the edge tracks the pointer with no lag.
function InboxColumn({ tasks }: { tasks: Task[] }) {
  const addToBacklog = usePlanner((s) => s.addToBacklog);
  const collapsed = usePlanner((s) => s.inboxCollapsed);
  const toggle = usePlanner((s) => s.toggleInbox);
  const width = usePlanner((s) => s.inboxWidth);
  const setWidth = usePlanner((s) => s.setInboxWidth);
  const [resizing, setResizing] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: "col-inbox",
    data: { type: "column", date: null },
  });

  if (collapsed) {
    // A thin rail; the chevron points right because the panel expands rightward.
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center border-r border-soft bg-surface transition-[width] duration-[180ms] ease-out">
        <button
          onClick={toggle}
          title="Expand inbox"
          className="flex h-7 w-7 items-center justify-center text-muted hover:bg-accent-faint hover:text-text"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    // Same element type (aside) as the collapsed branch above, so React reuses
    // the DOM node across collapse/expand and the width transition actually
    // fires. A section here would be a different element type, so React would
    // swap nodes and the animation would not run.
    <aside
      style={{ width, transition: resizing ? "none" : undefined }}
      className="relative flex shrink-0 flex-col border-r border-soft bg-surface transition-[width] duration-[180ms] ease-out"
    >
      <div className="flex items-center justify-between border-b border-soft px-2 py-1.5">
        <h2 className="text-[12px] font-medium text-muted">Inbox</h2>
        <button
          onClick={toggle}
          title="Collapse inbox"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-accent-faint hover:text-text"
        >
          ‹
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col overflow-y-auto px-1.5 py-2 " +
          (isOver ? "bg-accent-soft/60" : "")
        }
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-1.5 text-[12px] text-faint">Inbox is empty.</p>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
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
      <PanelSplitter
        side="right"
        width={width}
        setWidth={setWidth}
        defaultWidth={INBOX_DEFAULT_WIDTH}
        onResizingChange={setResizing}
      />
    </aside>
  );
}

// The collapsible right-hand Timeline panel for the selected day. Resizable from
// its left edge; width animates on collapse/expand, suppressed during live drag.
function TimelinePanel({ preview }: { preview: DropPreview | null }) {
  const selectedDate = usePlanner((s) => s.selectedDate);
  const collapsed = usePlanner((s) => s.timelineCollapsed);
  const toggle = usePlanner((s) => s.toggleTimeline);
  const width = usePlanner((s) => s.timelineWidth);
  const setWidth = usePlanner((s) => s.setTimelineWidth);
  const [resizing, setResizing] = useState(false);

  const rel = relativeLabel(selectedDate);
  const label = rel ? `${rel} · ${prettyDate(selectedDate)}` : prettyDate(selectedDate);

  if (collapsed) {
    // A thin rail so the week strip gets full width; the chevron re-expands.
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center border-l border-soft bg-surface transition-[width] duration-[180ms] ease-out">
        <button
          onClick={toggle}
          title="Expand timeline"
          className="flex h-7 w-7 items-center justify-center text-muted hover:bg-accent-faint hover:text-text"
        >
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside
      style={{ width, transition: resizing ? "none" : undefined }}
      className="relative flex shrink-0 flex-col border-l border-soft bg-surface transition-[width] duration-[180ms] ease-out"
    >
      <PanelSplitter
        side="left"
        width={width}
        setWidth={setWidth}
        defaultWidth={TIMELINE_DEFAULT_WIDTH}
        onResizingChange={setResizing}
      />
      <div className="flex items-center justify-between border-b border-soft px-2 py-1.5">
        <h2 className="truncate text-[12px] font-medium text-text">{label}</h2>
        <button
          onClick={toggle}
          title="Collapse timeline"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-accent-faint hover:text-text"
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
  const dayTasks = usePlanner((s) => s.dayTasks);
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
  const detailTaskId = usePlanner((s) => s.detailTaskId);
  const focusTaskId = usePlanner((s) => s.focusTaskId);
  const openFocus = usePlanner((s) => s.openFocus);

  // Drag overlay state: a list pill (column/inbox row) or a lifted block.
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeBlock, setActiveBlock] = useState<{
    task: Task;
    width: number;
    height: number;
  } | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  // Within-column reorder marker: which row the insertion line sits on and which
  // edge. Set in onDragOver, cleared on drag end/cancel. Provided to TaskItem via
  // InsertionContext. Null for cross-column moves (those use the zone highlight).
  const [insertion, setInsertion] = useState<Insertion | null>(null);

  // Guards against firing overlapping range extensions while one is in flight.
  const extending = useRef(false);
  // The horizontally scrolling day-strip container, so we can bring today into
  // view (the window starts a few days in the past for scroll-left access).
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Scroll today's column to the left edge of the strip once after it loads.
  const scrolledToToday = useRef(false);
  // Live Alt/Option state during a drag. Updated by global keydown/keyup so both
  // the drag modifier and onDragEnd can read it without re-rendering.
  const altRef = useRef(false);

  const scrollToToday = () => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-day="${todayKey()}"]`,
    );
    el?.scrollIntoView({ inline: "start", block: "nearest" });
  };

  // Bring a given day column into view (best-effort: a key outside the loaded
  // strip simply finds nothing, which is harmless).
  const scrollDayIntoView = (key: string) => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-day="${key}"]`,
    );
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  };

  // The single visible window for the selected day's timeline, grown to enclose
  // any block scheduled outside the default 06:00-22:00. Shared by every
  // timeline consumer via context and by the block drop math below.
  const timelineWindow = useMemo(() => computeWindow(dayTasks), [dayTasks]);

  // The block-drag modifier, rebuilt only when SNAP_PX changes (effectively
  // once). It closes over altRef so it reads live Alt state: Alt held skips the
  // y-snap for 1-min placement; otherwise it snaps y to the grid. Either way x
  // stays locked to the vertical axis.
  const snapBlockToGrid = useMemo<Modifier>(
    () =>
      ({ transform }) =>
        altRef.current
          ? { ...transform, x: 0 }
          : {
              ...transform,
              x: 0,
              y: Math.round(transform.y / SNAP_PX) * SNAP_PX,
            },
    [],
  );

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

  // Track live Alt/Option state for the block-drag fine-placement bypass.
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      altRef.current = e.altKey;
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
    };
  }, []);

  // Global keyboard day navigation: Left/Right step the selected day, t/T jumps
  // to today. Guarded so it never hijacks typing in a field or while the detail
  // modal is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do nothing while the detail modal or Focus (Zen) mode is open. Zen owns
      // ArrowLeft/Right for prev/next, so the day-nav must not also fire.
      if (detailTaskId != null || focusTaskId != null) return;
      // Do nothing when typing in an input, textarea, select, or editable node.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      // Ignore modified chords so shortcuts like Cmd+R are left alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = shiftDay(selectedDate, -1);
        setDate(next);
        scrollDayIntoView(next);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = shiftDay(selectedDate, 1);
        setDate(next);
        scrollDayIntoView(next);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setDate(todayKey());
        scrollToToday();
      }
      // Other keys: do not preventDefault, let them through.
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, detailTaskId, focusTaskId, setDate]);

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
    setInsertion(null);
    dragCursor.end();
  };

  const onDragOver = (e: DragOverEvent) => {
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as
      | { type?: string; time?: string; column?: string }
      | undefined;
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

    // Within-column reorder: active and over are both task rows in the SAME
    // column. Draw an explicit insertion line at the drop point. Cross-column
    // moves (different column, or over a container) fall back to the existing
    // zone highlight only, so clear any line here.
    if (
      a?.type === "task" &&
      o?.type === "task" &&
      o.column &&
      a.column === o.column &&
      e.active.id !== e.over?.id
    ) {
      // Edge is derived from the relative order of the dragged row and the row
      // it is over: dragging downward past a row lands below it, dragging up
      // lands above it. This matches where arrayMove will drop the row.
      const list =
        a.column === "inbox" ? backlog : weekTasks[a.column] ?? [];
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(Number(e.active.id));
      const to = ids.indexOf(Number(e.over!.id));
      const edge: Insertion["edge"] =
        from !== -1 && to !== -1 && from < to ? "below" : "above";
      setInsertion({ taskId: Number(e.over!.id), edge });
    } else {
      setInsertion(null);
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
      // Match the preview: Alt held drops at 1-min resolution (no grid snap),
      // otherwise snap to the 15-min grid. Both clamp into the visible day.
      const movedMin = startMin + delta.y / PX_PER_MIN;
      const newStart = clampStart(
        altRef.current ? Math.round(movedMin) : snap(movedMin),
        duration,
        timelineWindow,
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

  // "Focus day" is always a TODAY action regardless of the selected column.
  // Today's tasks live in the week map (today is always inside the loaded
  // window); fall back to dayTasks when today is the selected day.
  const today = todayKey();
  const todaysTasks = weekTasks[today] ?? (isToday ? dayTasks : []);
  const focusDayStartId = pickFocusDayStart(todaysTasks);

  return (
    <div className="flex h-full flex-col bg-surface text-text">
      {/* This bar IS the native macOS titlebar (titleBarStyle Overlay). The
          webview extends under it; the traffic lights float over the top-left,
          so we left-pad past them and left-align our controls. The empty space
          to the right is draggable window chrome (data-tauri-drag-region); the
          buttons are normal interactive children and stay clickable. */}
      <header
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center justify-end gap-1.5 border-b border-soft bg-surface px-3"
      >
        <button
          onClick={() => focusDayStartId != null && openFocus(focusDayStartId)}
          disabled={focusDayStartId == null}
          title={
            focusDayStartId != null
              ? "Focus today's scheduled tasks one at a time"
              : "Plan a task on the timeline to focus your day"
          }
          className={
            // The one primary button carries the accent (filled), at rest.
            "rounded px-2 py-0.5 text-[12px] font-semibold " +
            (focusDayStartId != null
              ? "bg-accent text-white hover:bg-accent-strong"
              : "cursor-default text-faint")
          }
        >
          ▶ Focus day
        </button>
        <button
          onClick={() => {
            if (!isToday) setDate(todayKey());
            scrollToToday();
          }}
          className="rounded px-2 py-0.5 text-[12px] text-muted hover:bg-accent-faint hover:text-text"
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
        <InsertionContext.Provider value={insertion}>
        <TimelineWindowContext.Provider value={timelineWindow}>
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
              <p className="px-4 py-3 text-[13px] text-muted">Loading…</p>
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
        </TimelineWindowContext.Provider>
        </InsertionContext.Provider>

        <DragOverlay
          dropAnimation={null}
          modifiers={activeBlock ? [snapBlockToGrid] : undefined}
        >
          {activeTask ? (
            // A faithful, slightly-lifted copy of the card: title + a quiet
            // estimate readout (so the user sees the duration that sizes the
            // drop-ghost), plus the priority left-rail for fidelity.
            <div
              className={
                "w-56 rounded-md border border-hairline bg-surface-raised px-3 py-2 shadow-lg rotate-[1deg] " +
                (activeTask.priority > 0
                  ? "border-l-2 " + priorityMeta(activeTask.priority).rail
                  : "")
              }
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-text">
                  {activeTask.title}
                </span>
                {activeTask.estimate_minutes != null && (
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {formatDuration(activeTask.estimate_minutes)}
                  </span>
                )}
              </div>
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
