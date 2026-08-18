import { useEffect, useState } from "react";
import { Focus, GripVertical, ListChecks, Paperclip, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Subtask, Task } from "../types";
import { usePlanner } from "../store";
import * as repo from "../db";
import { formatDuration } from "../lib/date";
import { priorityMeta } from "../lib/priority";
import { parseTags } from "../lib/tags";
import { htmlToPlainText } from "../lib/text";
import { Checkbox } from "./Checkbox";
import { TagChip } from "./TagChip";
import { useInsertion } from "./InsertionContext";

// A dense, title-first task row shared by every column (Inbox + day columns).
//
// Layout (vertical flex): a title line where the title always wins for space and
// wraps to up to 3 lines (line-clamp, never collapsing to "F..."), preceded only
// by the small fixed-width controls (drag handle, checkbox); priority shows as a
// left-edge color rail on the card root, not an inline slot. An optional muted
// notes snippet; then a compact, de-emphasized footer with all secondary
// metadata (scheduled time, estimate, tags, tracked time, subtasks). A bare task
// (no notes, no metadata) stays a tight near-single-line row; the card only grows
// as content requires.
//
// `detailed` mode (Day view only) reveals rich metadata and inline subtasks.
// The Inbox variant stays height-stable inside its grouped queue and promotes
// the estimate to the title line instead of expanding vertically on hover.
export function TaskItem({
  task,
  bucket,
  column,
  onComplete,
  detailed = false,
  variant = "default",
}: {
  task: Task;
  bucket: "day" | "backlog";
  // Week view only: which column this row currently lives in (a "yyyy-MM-dd"
  // day key, or "inbox"). Carried in the drag data so cross-column drops know
  // the source. The Day view omits it and relies on `bucket`.
  column?: string;
  // Optional hook fired when an open task is checked off, BEFORE toggleComplete
  // runs. Lets the parent column play a brief leaving animation and defer the
  // open/done partition so the row fades out before relocating to the Done
  // group. When omitted, completion toggles immediately (Inbox behavior).
  onComplete?: (task: Task) => void;
  // Day view only: render the roomier, always-expanded card (full footer at rest,
  // longer notes, inline checkable subtasks). Defaults to the calm strip card.
  detailed?: boolean;
  // Inbox uses the same task object and interactions inside a grouped queue,
  // with an inline estimate and a faint resting drag affordance.
  variant?: "default" | "inbox";
}) {
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const removeTask = usePlanner((s) => s.removeTask);
  const openDetail = usePlanner((s) => s.openDetail);
  const openFocus = usePlanner((s) => s.openFocus);
  const toggleSubtaskInStore = usePlanner((s) => s.toggleSubtask);

  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);

  // Detailed mode only: the task's subtasks, lazily loaded so the strip card
  // (and any task with no subtasks) never runs a query. The card owns this list
  // as the source of truth for the inline checklist and its progress chip, so an
  // optimistic toggle updates both with no flash and no dependence on which
  // bucket the Day view happens to read from.
  const [subtasks, setSubtasks] = useState<Subtask[] | null>(null);

  // Within-column reorder marker: if this row is the insertion target, draw a
  // 2px accent line on the relevant edge. Provided by PlannerShell's DndContext.
  const insertion = useInsertion();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", bucket, column, task } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const done = task.status === "done";
  const running = !!task.timer_started_at;
  const tags = parseTags(task.tags);
  const open = () => openDetail(task.id);
  const meta = priorityMeta(task.priority);
  const inbox = variant === "inbox";
  const dayCard = !detailed && !inbox;
  const compact = inbox;
  const inlineEstimate = inbox && task.estimate_minutes != null;

  // Notes are rich-text HTML (TipTap). Strip to plain text for a safe preview;
  // render the snippet only when there is actual text after stripping.
  const snippet = htmlToPlainText(task.notes);

  const hasSubtasks = !!task.subtask_total && task.subtask_total > 0;

  // Lazily load subtasks for the inline checklist, ONLY in detailed mode and ONLY
  // when the row actually has some (subtask_total > 0). Keyed on the task id so a
  // different task reuses the slot correctly; cleared back to null if the task
  // loses all its subtasks so we do not show a stale list.
  useEffect(() => {
    if (!detailed || !hasSubtasks) {
      setSubtasks(null);
      return;
    }
    let alive = true;
    repo.fetchSubtasks(task.id).then((rows) => {
      if (alive) setSubtasks(rows);
    });
    return () => {
      alive = false;
    };
  }, [detailed, hasSubtasks, task.id]);

  // Optimistically flip a subtask in the local list and persist via the store's
  // canonical sync path. The progress chip reads the local list when loaded, so
  // this updates instantly without waiting for round-trips.
  const toggleSubtask = (sub: Subtask) => {
    setSubtasks((prev) =>
      prev
        ? prev.map((s) =>
            s.id === sub.id ? { ...s, done: s.done ? 0 : 1 } : s,
          )
        : prev,
    );
    void toggleSubtaskInStore(sub);
  };

  // Progress chip count: prefer the live local list (detailed mode, once loaded)
  // so an inline toggle updates it immediately; otherwise use the row's computed
  // count from the fetch query.
  const subtaskDone =
    subtasks != null
      ? subtasks.filter((s) => s.done).length
      : task.subtask_done ?? 0;

  // Resting footer shows AT MOST two quiet items (scheduled time + first tag,
  // or a running dot). Everything else (estimate, tracked, subtasks,
  // attachments, extra tags) is revealed on hover, keeping the card serene at
  // rest. `hasRestMeta` controls whether the resting footer row exists at all.
  const restTag = tags[0];
  const hasRestMeta =
    !!task.scheduled_start ||
    task.estimate_minutes != null ||
    running ||
    !!restTag;
  // Extra metadata only worth showing once the card is hovered.
  const hasHoverExtra =
    task.actual_minutes > 0 ||
    hasSubtasks ||
    (!!task.attachment_count && task.attachment_count > 0) ||
    tags.length > 1;
  // Inbox rows never gain vertical content on hover. Day cards use a stable
  // metadata line at rest; rich content remains reserved for detailed Day view.
  const showExtras = detailed;
  const showFooter =
    (detailed && (hasRestMeta || hasHoverExtra)) ||
    (dayCard && hasRestMeta);

  // Priority left rail: a 2px colored left border. It is the only persistent
  // edge on the otherwise flat list row.
  const railClass = task.priority > 0 ? " border-l-2 " + meta.rail : "";

  if (dayCard) {
    const hasDayMeta =
      !!task.scheduled_start ||
      !!restTag ||
      hasSubtasks ||
      running;

    return (
      <li
        ref={setNodeRef}
        style={style}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={
          "relative rounded-[4px] border bg-surface-raised px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.045)] transition-[border-color,box-shadow,transform] duration-150 ease-out " +
          (hovered
            ? "border-soft shadow-[0_3px_8px_rgba(0,0,0,0.08)]"
            : "border-hairline")
        }
      >
        {insertion && insertion.taskId === task.id && (
          <span
            className={
              "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent " +
              (insertion.edge === "above" ? "-top-1.5" : "-bottom-1.5")
            }
          />
        )}

        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={
            "absolute left-0.5 top-1/2 flex h-6 -translate-y-1/2 cursor-grab items-center text-faint transition-opacity " +
            (hovered ? "opacity-100" : "opacity-20")
          }
        >
          <GripVertical className="h-3 w-3" />
        </button>

        <div className="flex items-start gap-2.5 pl-2">
          <span className="flex h-5 shrink-0 items-center">
            <Checkbox
              checked={done}
              onChange={() => {
                if (!done && onComplete) onComplete(task);
                else toggleComplete(task);
              }}
            />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <button
                onClick={open}
                title={task.title}
                className={
                  "min-w-0 flex-1 line-clamp-2 text-left text-[14px] font-medium leading-5 " +
                  (done ? "text-muted line-through" : "text-text")
                }
              >
                {task.title}
              </button>

              <div className="relative h-5 w-12 shrink-0">
                {task.estimate_minutes != null && (
                  <button
                    onClick={open}
                    title="Estimate"
                    className={
                      "absolute right-0 top-0 rounded bg-soft px-1.5 py-1 text-[10px] font-semibold tabular-nums leading-none text-muted transition-opacity " +
                      (hovered ? "opacity-0" : "opacity-100")
                    }
                  >
                    {formatDuration(task.estimate_minutes)}
                  </button>
                )}
                <span
                  className={
                    "absolute right-0 top-0 flex items-center gap-0.5 transition-opacity " +
                    (hovered ? "opacity-100" : "pointer-events-none opacity-0")
                  }
                >
                  <button
                    aria-label="Focus on this task"
                    title="Focus"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openFocus(task.id)}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-accent-soft hover:text-accent"
                  >
                    <Focus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label="Delete task"
                    title="Delete"
                    onClick={() => removeTask(task.id)}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-alert-soft hover:text-alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>

            {hasDayMeta && (
              <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-muted">
                {task.scheduled_start && (
                  <span className="font-medium tabular-nums">
                    {task.scheduled_start}
                  </span>
                )}
                {restTag && <TagChip name={restTag} onClick={open} compact />}
                {hasSubtasks && (
                  <button
                    onClick={open}
                    title="Subtasks"
                    className="inline-flex items-center gap-1 tabular-nums hover:text-text"
                  >
                    <ListChecks className="h-3 w-3" />
                    {subtaskDone}/{task.subtask_total}
                  </button>
                )}
                {running && (
                  <span
                    title="Timer running"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        "relative border transition-[border-color,background-color,box-shadow] duration-150 ease-out " +
        (inbox
          ? "rounded-none border-transparent bg-transparent px-3 py-2.5 "
          : detailed
            ? "rounded-[4px] border-hairline bg-surface-raised px-3 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.045)] "
            : "rounded-md border-transparent bg-transparent px-2.5 py-2 ") +
        (hovered
          ? detailed
            ? "border-soft bg-surface-raised shadow-[0_3px_8px_rgba(0,0,0,0.08)]"
            : "bg-accent-faint"
          : "") +
        railClass
      }
    >
      {/* Within-column reorder insertion line: a 2px accent bar on the edge the
          dragged row will land against. Tied to the active drag (cleared on
          drag end/cancel), so it never lingers after drop. */}
      {insertion && insertion.taskId === task.id && (
        <span
          className={
            "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent " +
            (insertion.edge === "above" ? "-top-0.5" : "-bottom-0.5")
          }
        />
      )}
      {/* Title line: controls are fixed-width; the title flex-grows and wraps to
          up to 3 lines. Controls top-align so they sit on the first title line
          when it wraps. The h-5 wrappers keep them vertically centered on a
          single-line title, preserving the dense one-row look for bare tasks. */}
      <div className={"flex gap-2 " + (inbox ? "items-center" : "items-start")}>
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={
            // Faint at rest so it reads as a quiet hint without competing with
            // the title; fully visible on hover.
            "flex h-5 shrink-0 cursor-grab items-center text-faint transition-opacity " +
            (hovered ? "opacity-100" : inbox ? "opacity-30" : "opacity-20")
          }
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <span className="flex h-5 shrink-0 items-center">
          <Checkbox
            checked={done}
            onChange={() => {
              // Completing an open task lets the parent column animate the
              // departure (it owns the timing + the eventual toggleComplete).
              // Re-opening, or columns without the hook, toggle directly.
              if (!done && onComplete) onComplete(task);
              else toggleComplete(task);
            }}
          />
        </span>

        <button
          onClick={open}
          title={task.title}
          className={
            "min-w-0 flex-1 text-left text-[14px] font-medium leading-5 " +
            (compact ? "truncate " : "line-clamp-3 ") +
            (done ? "text-muted line-through" : "text-text")
          }
        >
          {task.title}
        </button>

        {inbox && task.scheduled_start && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted">
            {task.scheduled_start}
          </span>
        )}

        {inlineEstimate && (
          <button
            onClick={open}
            title="Estimate"
            className="mt-0.5 shrink-0 rounded-md bg-soft px-1.5 py-1 text-[10px] font-semibold tabular-nums leading-none text-muted hover:text-text"
          >
            {formatDuration(task.estimate_minutes!)}
          </button>
        )}

        {inbox && restTag && <TagChip name={restTag} onClick={open} />}

        {inbox && running && (
          <span
            title="Timer running"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
          />
        )}

        <button
          aria-label="Focus on this task"
          title="Focus"
          // Stop the drag from starting when pressing this control.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openFocus(task.id)}
          className={
            "flex h-5 shrink-0 items-center rounded px-1 text-muted hover:bg-accent-soft hover:text-accent " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          <Focus className="h-3.5 w-3.5" />
        </button>

        <button
          aria-label="Delete task"
          onClick={() => removeTask(task.id)}
          className={
            "flex h-5 shrink-0 items-center rounded px-1 text-muted hover:bg-alert-soft hover:text-alert " +
            (hovered ? "opacity-100" : "opacity-0")
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Notes preview: a muted 1-2 line plain-text snippet, shown only when the
          task has notes. Indented to align under the title. Rich-text HTML is
          stripped to text (never rendered raw) by htmlToPlainText. */}
      {detailed && snippet && (
        <p
          className={
            // Detailed mode shows a longer, readable description inline; the
            // strip card keeps the tight two-line clamp.
            "pl-7 pt-1 text-[12px] leading-snug text-muted " +
            (detailed ? "line-clamp-6" : "line-clamp-2")
          }
        >
          {snippet}
        </p>
      )}

      {/* Inline subtask checklist (detailed mode only): existing subtasks render
          as a compact checkable list using the shared Checkbox. Checking one is
          optimistic + persisted; there is no "add" input here (that stays in the
          modal). Indented to align under the title. */}
      {detailed && hasSubtasks && subtasks && subtasks.length > 0 && (
        <ul className="flex flex-col gap-1 pl-7 pt-1.5">
          {subtasks.map((sub) => {
            const subDone = !!sub.done;
            return (
              <li key={sub.id} className="flex items-start gap-2">
                <span className="flex h-4 shrink-0 items-center">
                  <Checkbox
                    checked={subDone}
                    onChange={() => toggleSubtask(sub)}
                    title={subDone ? "Mark not done" : "Mark done"}
                  />
                </span>
                <button
                  onClick={open}
                  title={sub.title}
                  className={
                    "min-w-0 flex-1 text-left text-[12px] leading-4 " +
                    (subDone ? "text-faint line-through" : "text-muted")
                  }
                >
                  {sub.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer: in the strip card, at REST shows at most two quiet items
          (scheduled time + first tag, or a running dot) and hover reveals the
          rest (estimate, tracked, subtasks, attachments, extra tags) so the
          resting card stays serene. In detailed mode the full footer shows at
          rest (showExtras is always true). Indented to align under the title. */}
      {showFooter && (
        <div
          className={
            "flex flex-wrap items-center gap-2 pt-1.5 text-[12px] leading-none text-muted " +
            (dayCard ? "pl-12" : "pl-7")
          }
        >
          {task.scheduled_start && (
            <span className="tabular-nums text-muted">
              {task.scheduled_start}
            </span>
          )}
          {task.estimate_minutes != null && (
            <button
              onClick={open}
              title="Estimate"
              className="tabular-nums text-muted hover:text-text"
            >
              {formatDuration(task.estimate_minutes)}
            </button>
          )}
          {running && (
            <span
              title="Timer running"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
          )}
          {/* First tag rests; remaining tags reveal with the extras. */}
          {restTag && (detailed || dayCard) && (
            <TagChip name={restTag} onClick={open} />
          )}

          {/* Extras: in the strip card these are kept mounted only on hover so
              resting clicks never hit them; in detailed mode they show at rest. */}
          {showExtras && (
            <>
              {task.actual_minutes > 0 && (
                <button
                  onClick={open}
                  title="Tracked time"
                  className="tabular-nums text-muted hover:text-text"
                >
                  {formatDuration(task.actual_minutes)} tracked
                </button>
              )}
              {hasSubtasks && (
                <button
                  onClick={open}
                  title="Subtasks"
                  className="inline-flex items-center gap-1 tabular-nums text-muted hover:text-text"
                >
                  <ListChecks className="h-3 w-3" />
                  {subtaskDone}/{task.subtask_total}
                </button>
              )}
              {!!task.attachment_count && task.attachment_count > 0 && (
                <button
                  onClick={open}
                  title="Attachments"
                  className="inline-flex items-center gap-1 tabular-nums text-muted hover:text-text"
                >
                  <Paperclip className="h-3 w-3" />
                  {task.attachment_count}
                </button>
              )}
              {tags.slice(1).map((t) => (
                <TagChip key={t} name={t} onClick={open} />
              ))}
            </>
          )}
        </div>
      )}
    </li>
  );
}
