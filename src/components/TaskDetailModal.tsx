import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlanner } from "../store";
import { formatDateTime } from "../lib/date";
import { EstimatePicker } from "./EstimatePicker";
import { TimerControl } from "./TimerControl";
import { RichTextEditor } from "./RichTextEditor";
import { SubtaskList } from "./SubtaskList";
import { PriorityPicker } from "./PriorityPicker";
import { TagEditor } from "./TagEditor";
import { Checkbox } from "./Checkbox";

// Inline metadata field: an 11px muted label next to its control. Matches the
// dense footer scale on the cards.
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

// Section heading ("Description", "Subtasks", "Comments"): 11px muted semibold
// uppercase, matching the column section labels.
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </h3>
  );
}

export function TaskDetailModal({ taskId }: { taskId: number }) {
  const task = usePlanner((s) =>
    [...s.dayTasks, ...s.backlog, ...s.carryOver].find((t) => t.id === taskId),
  );
  const close = usePlanner((s) => s.closeDetail);
  const refresh = usePlanner((s) => s.refresh);
  const editTask = usePlanner((s) => s.editTask);
  const editTaskQuiet = usePlanner((s) => s.editTaskQuiet);
  const removeTask = usePlanner((s) => s.removeTask);
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const comments = usePlanner((s) => s.detailComments);
  const addComment = usePlanner((s) => s.addComment);
  const deleteComment = usePlanner((s) => s.deleteComment);

  const [title, setTitle] = useState(task?.title ?? "");
  const [commentBody, setCommentBody] = useState("");
  const descTimer = useRef<number | undefined>(undefined);

  const doClose = () => {
    if (descTimer.current) window.clearTimeout(descTimer.current);
    refresh();
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!task) return null;
  const done = task.status === "done";

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) editTask(task.id, { title: next });
    else setTitle(task.title);
  };

  const onDescChange = (html: string) => {
    if (descTimer.current) window.clearTimeout(descTimer.current);
    descTimer.current = window.setTimeout(() => {
      editTaskQuiet(task.id, { notes: html || null });
    }, 500);
  };

  const submitComment = () => {
    const body = commentBody.trim();
    if (!body) return;
    addComment(body);
    setCommentBody("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-8"
      onClick={doClose}
    >
      <div
        className="mt-6 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2 border-b border-neutral-200 px-4 py-2.5">
          <span className="flex h-[26px] shrink-0 items-center">
            <Checkbox checked={done} onChange={() => toggleComplete(task)} />
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={
              "flex-1 text-[18px] font-semibold leading-relaxed outline-none " +
              (done ? "text-neutral-400 line-through" : "text-neutral-800")
            }
          />
          <button
            onClick={doClose}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded p-1 text-[11px] leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Metadata: a compact wrapped row of label+control fields. */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Meta label="Priority">
              <PriorityPicker
                value={task.priority}
                onChange={(v) => editTask(task.id, { priority: v })}
              />
            </Meta>
            <Meta label="Estimate">
              <EstimatePicker
                value={task.estimate_minutes}
                revealed
                onChange={(v) => editTask(task.id, { estimate_minutes: v })}
              />
            </Meta>
            <Meta label="Tracked">
              <TimerControl task={task} revealed />
            </Meta>
            {task.scheduled_start && (
              <Meta label="Scheduled">
                <span className="text-[11px] tabular-nums text-neutral-700">
                  {task.scheduled_start}
                </span>
              </Meta>
            )}
            <Meta label="Tags">
              <TagEditor
                value={task.tags}
                onChange={(json) => editTask(task.id, { tags: json })}
              />
            </Meta>
          </div>

          {/* Description */}
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Description
          </label>
          <RichTextEditor
            initialValue={task.notes ?? ""}
            placeholder="Add details…"
            onChange={onDescChange}
          />

          {/* Subtasks */}
          <div className="mt-4">
            <SubtaskList />
          </div>

          {/* Comments */}
          <div className="mt-4">
            <SectionLabel>Comments</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {comments.length === 0 && (
                <p className="text-[14px] text-neutral-400">No comments yet.</p>
              )}
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md bg-neutral-50 p-2 text-[14px]"
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">
                      {formatDateTime(c.created_at)}
                    </span>
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="text-[10px] text-neutral-300 hover:text-red-500"
                    >
                      delete
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-neutral-700">{c.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Write a comment… (⌘/Ctrl+Enter)"
                rows={2}
                className="flex-1 resize-y rounded-md border border-neutral-200 p-2 text-[14px] outline-none focus:border-neutral-300"
              />
              <button
                onClick={submitComment}
                className="self-end rounded-md bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-600"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-neutral-200 px-3 py-2">
          <button
            onClick={() => {
              removeTask(task.id);
              close();
            }}
            className="text-[11px] text-red-500 hover:underline"
          >
            Delete task
          </button>
          <button
            onClick={doClose}
            className="rounded-md bg-neutral-100 px-3 py-1.5 text-[11px] text-neutral-700 hover:bg-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
