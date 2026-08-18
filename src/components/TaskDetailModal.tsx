import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlanner } from "../store";
import { formatDateTime } from "../lib/date";
import { EstimatePicker } from "./EstimatePicker";
import { TimerControl } from "./TimerControl";
import { RichTextEditor } from "./RichTextEditor";
import { SubtaskList } from "./SubtaskList";
import { AttachmentList } from "./AttachmentList";
import { PriorityPicker } from "./PriorityPicker";
import { TagEditor } from "./TagEditor";
import { Checkbox } from "./Checkbox";

// Inline metadata field: a 12px muted label next to its control.
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

// Section heading ("Description", "Subtasks", "Comments"): 12px muted medium,
// sentence case (no more uppercase micro-caps).
function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-[12px] font-medium text-muted">{children}</h3>;
}

export function TaskDetailModal({ taskId }: { taskId: number }) {
  const task = usePlanner((s) =>
    s.detailTask?.id === taskId ? s.detailTask : undefined,
  );
  const close = usePlanner((s) => s.closeDetail);
  const editTask = usePlanner((s) => s.editTask);
  const editTaskQuiet = usePlanner((s) => s.editTaskQuiet);
  const removeTask = usePlanner((s) => s.removeTask);
  const toggleComplete = usePlanner((s) => s.toggleComplete);
  const openFocus = usePlanner((s) => s.openFocus);
  const comments = usePlanner((s) => s.detailComments);
  const addComment = usePlanner((s) => s.addComment);
  const deleteComment = usePlanner((s) => s.deleteComment);

  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const descTimer = useRef<number | undefined>(undefined);
  const pendingDescHtml = useRef<string | null>(null);

  const flushPendingDescription = async () => {
    if (descTimer.current) {
      window.clearTimeout(descTimer.current);
      descTimer.current = undefined;
    }
    const pending = pendingDescHtml.current;
    if (pending == null) return;
    pendingDescHtml.current = null;
    await editTaskQuiet(taskId, { notes: pending || null });
  };

  const doClose = async () => {
    await flushPendingDescription();
    close();
  };

  useEffect(() => {
    return () => {
      if (descTimer.current) window.clearTimeout(descTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!task) return;
    if (!titleDirty) setTitle(task.title);
  }, [task?.id, task?.title, titleDirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void doClose();
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
    setTitleDirty(false);
  };

  const onDescChange = (html: string) => {
    pendingDescHtml.current = html;
    if (descTimer.current) window.clearTimeout(descTimer.current);
    descTimer.current = window.setTimeout(() => {
      pendingDescHtml.current = null;
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
      onClick={() => void doClose()}
    >
      <div
        className="mt-6 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2 border-b border-soft px-4 py-2.5">
          <span className="flex h-[26px] shrink-0 items-center">
            <Checkbox checked={done} onChange={() => toggleComplete(task)} />
          </span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleDirty(true);
            }}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={
              "flex-1 text-[18px] font-semibold leading-relaxed outline-none " +
              (done ? "text-muted line-through" : "text-text")
            }
          />
          <button
            onClick={async () => {
              await flushPendingDescription();
              await openFocus(task.id);
              close();
            }}
            title="Focus on this task"
            className="mt-0.5 shrink-0 rounded bg-accent px-2 py-1 text-[11px] font-medium leading-none text-white hover:bg-accent-strong"
          >
            ◎ Focus
          </button>
          <button
            onClick={() => void doClose()}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded p-1 text-[11px] leading-none text-muted hover:bg-accent-faint hover:text-text"
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
              <TimerControl task={task} />
            </Meta>
            {task.scheduled_start && (
              <Meta label="Scheduled">
                <span className="text-[12px] tabular-nums text-text">
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
          <label className="mb-1 block text-[12px] font-medium text-muted">
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

          {/* Attachments */}
          <div className="mt-4">
            <AttachmentList />
          </div>

          {/* Comments */}
          <div className="mt-4">
            <SectionLabel>Comments</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {comments.length === 0 && (
                <p className="text-[14px] text-muted">No comments yet.</p>
              )}
              {comments.map((c) => (
                <li key={c.id} className="rounded-md bg-surface p-2 text-[14px]">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-muted">
                      {formatDateTime(c.created_at)}
                    </span>
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="text-[10px] text-faint hover:text-alert"
                    >
                      delete
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-text">{c.body}</p>
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
                className="flex-1 resize-y rounded-md border border-hairline p-2 text-[14px] outline-none focus:border-accent"
              />
              <button
                onClick={submitComment}
                className="self-end rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent-strong"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-soft px-3 py-2">
          <button
            onClick={() => {
              removeTask(task.id);
              close();
            }}
            className="text-[11px] text-alert hover:underline"
          >
            Delete task
          </button>
          <button
            onClick={() => void doClose()}
            className="rounded-md bg-soft px-3 py-1.5 text-[11px] text-text hover:bg-hairline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
