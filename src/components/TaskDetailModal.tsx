import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlanner } from "../store";
import { formatDateTime } from "../lib/date";
import { EstimatePicker } from "./EstimatePicker";
import { TimerControl } from "./TimerControl";
import { RichTextEditor } from "./RichTextEditor";
import { SubtaskList } from "./SubtaskList";
import { PriorityPicker } from "./PriorityPicker";
import { TagEditor } from "./TagEditor";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </div>
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
        className="mt-6 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-neutral-200 p-4">
          <input
            type="checkbox"
            checked={done}
            onChange={() => toggleComplete(task)}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-indigo-500"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={
              "flex-1 text-lg font-semibold outline-none " +
              (done ? "text-neutral-400 line-through" : "text-neutral-800")
            }
          />
          <button
            onClick={doClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Metadata */}
          <div className="mb-4 flex flex-wrap items-center gap-4">
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
                <span className="text-sm tabular-nums text-neutral-700">
                  {task.scheduled_start}
                </span>
              </Meta>
            )}
          </div>

          {/* Tags */}
          <div className="mb-4">
            <Meta label="Tags">
              <TagEditor
                value={task.tags}
                onChange={(json) => editTask(task.id, { tags: json })}
              />
            </Meta>
          </div>

          {/* Description */}
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Description
          </label>
          <RichTextEditor
            initialValue={task.notes ?? ""}
            placeholder="Add details…"
            onChange={onDescChange}
          />

          {/* Subtasks */}
          <div className="mt-6">
            <SubtaskList />
          </div>

          {/* Comments */}
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Comments
            </h3>
            <ul className="flex flex-col gap-2">
              {comments.length === 0 && (
                <p className="text-sm text-neutral-400">No comments yet.</p>
              )}
              {comments.map((c) => (
                <li key={c.id} className="rounded-md bg-neutral-50 p-2 text-sm">
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
                className="flex-1 resize-y rounded-md border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-300"
              />
              <button
                onClick={submitComment}
                className="self-end rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-neutral-200 p-3">
          <button
            onClick={() => {
              removeTask(task.id);
              close();
            }}
            className="text-sm text-red-500 hover:underline"
          >
            Delete task
          </button>
          <button
            onClick={doClose}
            className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
