import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Attachment, Comment, Subtask, Task } from "./types";
import * as repo from "./db";
import { dayRange, shiftDay, todayKey } from "./lib/date";
import { timeToMinutes } from "./lib/timeline";
import * as prefs from "./lib/prefs";
import { DEFAULT_THEME, applyTheme, normalizeTheme } from "./lib/themes";
import { reconcileTaskProjection } from "./lib/taskProjection";

type Bucket = "day" | "backlog";

// Which layout the middle region shows. "week" = the horizontally scrolling day
// strip; "day" = a single widened column for the selected day. selectedDate stays
// the source of truth for WHICH day; this only picks the layout. Persisted to
// localStorage like the other view-chrome prefs.
export type ViewMode = "week" | "day";
export type InspectorTab = "timeline" | "inbox";

// Pomodoro is a fixed rhythm, not a configurable timer app: a 25 minute work
// block followed by a 5 minute break, auto-advancing work -> break -> work.
export const POMODORO_WORK_MIN = 25;
export const POMODORO_BREAK_MIN = 5;

// Minimal, serializable pomodoro state. A future floating widget can subscribe
// to this slice directly. `phaseEndsAt` is an absolute epoch-ms deadline for the
// current phase (null while paused); `pausedRemainingMs` holds the frozen
// remainder while paused (null while running).
export interface PomodoroState {
  active: boolean;
  phase: "work" | "break";
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}

const POMODORO_INACTIVE: PomodoroState = {
  active: false,
  phase: "work",
  phaseEndsAt: null,
  pausedRemainingMs: null,
};

// One quiet notification per phase change. Best-effort: a denied permission or a
// missing plugin must never break the rhythm, so failures are swallowed.
async function notify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) sendNotification({ title, body });
  } catch (err) {
    console.error("Notification failed", err);
  }
}

// Persistent inspector preferences (single device, localStorage only).
export const INSPECTOR_DEFAULT_WIDTH = 320;
const INSPECTOR_MIN_WIDTH = 300;
const INSPECTOR_MAX_WIDTH = 420;

const clamp = (px: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(px)));

// The week strip loads a window of days. To make overdue/carry-over tasks
// reachable by simply scrolling left (we deliberately do not build a dedicated
// carry-over UI), the window starts a few days BEFORE today; today stays the
// default selected day and the strip extends into the future on scroll-right.
const WEEK_PAST_DAYS = 7; // days before today included in the initial window
const WEEK_INITIAL_DAYS = 7 + 15; // 7 past + today + ~14 ahead
const WEEK_EXTEND_DAYS = 7;

let refreshRequestSeq = 0;
let loadWeekRequestSeq = 0;
let weekProjectionVersion = 0;

// Apply `fields` to the matching task wherever it appears in the week map,
// returning a new map. Pure. In-place edits only (does not relocate rows
// between day keys); cross-column moves are handled separately.
function patchTaskInWeek(
  weekTasks: Record<string, Task[]>,
  id: number,
  fields: Partial<Task>,
): Record<string, Task[]> {
  const next: Record<string, Task[]> = {};
  for (const key of Object.keys(weekTasks)) {
    next[key] = weekTasks[key].map((t) =>
      t.id === id ? { ...t, ...fields } : t,
    );
  }
  return next;
}

// Remove a task from every day bucket in the week map (used on delete).
function removeTaskFromWeek(
  weekTasks: Record<string, Task[]>,
  id: number,
): Record<string, Task[]> {
  const next: Record<string, Task[]> = {};
  for (const key of Object.keys(weekTasks)) {
    next[key] = weekTasks[key].filter((t) => t.id !== id);
  }
  return next;
}

// Build a day-key -> tasks map. `days` seeds every requested key (so empty days
// render as empty columns rather than disappearing); rows are bucketed by their
// planned_date and arrive already ordered from the range query.
function groupByDay(rows: Task[], days: string[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  for (const key of days) map[key] = [];
  for (const t of rows) {
    if (t.planned_date && map[t.planned_date]) map[t.planned_date].push(t);
  }
  return map;
}

// Buckets that hold Task rows in the store. Optimistic patches walk all three so
// a task is updated wherever it currently lives (a backlog task pulled onto the
// timeline starts in `backlog`, a carried-over task in `carryOver`).
const TASK_BUCKETS = ["dayTasks", "backlog", "carryOver"] as const;
type TaskBucketKey = (typeof TASK_BUCKETS)[number];
type TaskBuckets = Pick<PlannerState, TaskBucketKey>;

// Apply `fields` to the matching task across every in-memory bucket and return
// the new bucket arrays. Pure: callers decide what to do with the result.
function patchTaskInBuckets(
  buckets: TaskBuckets,
  id: number,
  fields: Partial<Task>,
): TaskBuckets {
  const next = {} as TaskBuckets;
  for (const key of TASK_BUCKETS) {
    next[key] = buckets[key].map((t) =>
      t.id === id ? { ...t, ...fields } : t,
    );
  }
  return next;
}

// Find a task by id wherever it currently lives in memory: the day buckets, the
// backlog, the carry-over list, or any loaded week column. Used by Focus mode so
// a task on a non-selected day still resolves.
function findTaskAnywhere(
  s: Pick<PlannerState, "dayTasks" | "backlog" | "carryOver" | "weekTasks">,
  id: number,
): Task | undefined {
  const direct = [...s.dayTasks, ...s.backlog, ...s.carryOver].find(
    (t) => t.id === id,
  );
  if (direct) return direct;
  for (const key of Object.keys(s.weekTasks)) {
    const found = s.weekTasks[key].find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

// Build the Focus navigation queue for the focused task: every task on the
// focused task's day that has a scheduled_start, sorted ascending by start time.
// Prefer the week map for that day; fall back to dayTasks when the focused
// task's day is the selected day (and not loaded in the week map). `index` is the
// position of the focused task in that queue, or -1 if it is not scheduled.
function buildFocusQueue(
  s: Pick<
    PlannerState,
    "dayTasks" | "backlog" | "carryOver" | "weekTasks" | "selectedDate"
  >,
  focusTaskId: number,
): { queue: Task[]; index: number } {
  // Zen mode always works the CURRENT day: the queue is today's scheduled
  // tasks in start-time order, regardless of which day (or an unscheduled
  // task) focus was entered from. A focused task not in today's queue gets
  // index -1, so Next jumps to today's first block and Prev is a no-op.
  const today = todayKey();
  let dayList = s.weekTasks[today];
  if (dayList == null && today === s.selectedDate) dayList = s.dayTasks;
  if (dayList == null) dayList = [];

  const queue = dayList
    .filter((t) => t.scheduled_start != null)
    .sort(
      (a, b) =>
        timeToMinutes(a.scheduled_start!) - timeToMinutes(b.scheduled_start!),
    );
  const index = queue.findIndex((t) => t.id === focusTaskId);
  return { queue, index };
}

function collectRunningTaskIds(
  s: Pick<PlannerState, "dayTasks" | "backlog" | "carryOver" | "weekTasks">,
): number[] {
  const ids = new Set<number>();
  const visit = (task: Task) => {
    if (task.timer_started_at) ids.add(task.id);
  };
  for (const task of s.dayTasks) visit(task);
  for (const task of s.backlog) visit(task);
  for (const task of s.carryOver) visit(task);
  for (const key of Object.keys(s.weekTasks)) {
    for (const task of s.weekTasks[key]) visit(task);
  }
  return [...ids];
}

interface PlannerState {
  // Persistent right inspector. Timeline is the default tab; Inbox is a peer.
  inspectorCollapsed: boolean;
  toggleInspector: () => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  // Middle-region layout: "week" strip or single expanded "day". Persisted.
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Active theme id (see src/lib/themes.ts). Persisted to localStorage; on set
  // we also flip document.documentElement.dataset.theme so the whole shell
  // re-themes live.
  theme: string;
  setTheme: (id: string) => void;

  inspectorWidth: number;
  setInspectorWidth: (px: number) => void;

  selectedDate: string;
  dayTasks: Task[];
  backlog: Task[];
  carryOver: Task[];
  loading: boolean;

  // Week view state. `weekDays` is the contiguous list of loaded day keys
  // (anchored on today, extending into the future); `weekTasks` maps each day
  // key to its tasks. The Week view's Inbox reuses `backlog`.
  weekDays: string[];
  weekTasks: Record<string, Task[]>;
  weekLoading: boolean;
  // Load the initial week window (today .. +N days).
  loadWeek: () => Promise<void>;
  // Append more future days to the right and load their tasks.
  extendWeek: (extraDays?: number) => Promise<void>;
  // Cross-column move within the Week view: move a task to `toDate` (a loaded
  // day) or to the Inbox (null). Patches the in-memory week map + backlog
  // synchronously so the row lands in its new column with no flash, then
  // persists in the background. No reload on success.
  moveTaskWeek: (id: number, toDate: string | null) => Promise<void>;
  // Add a task directly to a specific day in the Week view.
  addToWeekDay: (date: string, title: string) => Promise<void>;

  // Task detail modal
  detailTaskId: number | null;
  detailTask: Task | null;
  detailComments: Comment[];
  detailSubtasks: Subtask[];
  detailAttachments: Attachment[];
  openDetail: (id: number) => Promise<void>;
  closeDetail: () => void;
  addComment: (body: string) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  addSubtask: (title: string) => Promise<void>;
  toggleSubtask: (sub: Subtask) => Promise<void>;
  deleteSubtask: (id: number) => Promise<void>;
  // Copy one or more source files into the task's local attachment store, then
  // persist a row per file and reload the list. No-op when no task is open.
  addAttachments: (srcPaths: string[]) => Promise<void>;
  deleteAttachment: (id: number) => Promise<void>;

  // Focus (Zen) mode. A full-screen, calm single-task surface. The session
  // timer reuses repo.startTimer / repo.stopRunningTimers, so a focus session is
  // the only thing that records actual time automatically.
  focusTaskId: number | null;
  focusSubtasks: Subtask[];
  openFocus: (id: number) => Promise<void>;
  closeFocus: () => Promise<void>;
  focusNext: () => Promise<void>;
  focusPrev: () => Promise<void>;
  completeFocus: () => Promise<void>;
  toggleFocusSubtask: (sub: Subtask) => Promise<void>;

  // Pomodoro mode (opt-in inside Zen). A WORK phase IS the focus timer running;
  // a BREAK phase is the focus timer NOT running. Work time folds into
  // actual_minutes via repo.stopRunningTimers at the work -> break boundary, so
  // breaks never touch actual_minutes. The state object is replaced only when
  // pomodoro actually changes, so a stable-slice selector (s.pomodoro) is safe.
  pomodoro: PomodoroState;
  startPomodoro: () => Promise<void>;
  stopPomodoro: () => Promise<void>;
  pausePomodoro: () => Promise<void>;
  resumePomodoro: () => Promise<void>;
  skipPhase: () => Promise<void>;
  advancePomodoroIfDue: () => Promise<void>;

  refresh: () => Promise<void>;
  syncTaskFromDb: (id: number) => Promise<void>;
  setDate: (date: string) => Promise<void>;
  // Patch a task in memory immediately, then run `persist` in the background.
  applyOptimistic: (
    id: number,
    fields: Partial<Task>,
    persist: () => Promise<void>,
  ) => Promise<void>;

  addToDay: (title: string, estimateMinutes?: number | null) => Promise<void>;
  addToBacklog: (title: string, estimateMinutes?: number | null) => Promise<void>;
  editTask: (
    id: number,
    fields: Record<string, string | number | null>,
  ) => Promise<void>;
  // Persist without reloading the board (for high-frequency edits like typing).
  editTaskQuiet: (
    id: number,
    fields: Record<string, string | number | null>,
  ) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  reorder: (bucket: Bucket, orderedIds: number[]) => Promise<void>;
  moveTask: (id: number, toDate: string | null) => Promise<void>;
  scheduleTask: (id: number, startTime: string) => Promise<void>;
  // Drag-to-schedule from any week column or the Inbox onto the timeline of the
  // selected day. Finds the task wherever it lives (day buckets, backlog, or the
  // week map), then schedules it on `selectedDate` at `startTime`, relocating it
  // in the week map so the source column no longer shows it and the selected
  // day's column / dayTasks do. Optimistic + flash-free, persists in background.
  scheduleOnSelected: (id: number, startTime: string) => Promise<void>;
  unscheduleTask: (id: number) => Promise<void>;
  toggleTimer: (task: Task) => Promise<void>;
  setActual: (id: number, minutes: number) => Promise<void>;
  moveToToday: (id: number) => Promise<void>;
  moveAllToToday: (ids: number[]) => Promise<void>;
}

// Shared phase-transition logic for both auto-advance and skip. Leaving WORK
// folds the work block into actual_minutes (repo.stopRunningTimers) and refreshes
// so the card reflects it; entering WORK starts a fresh work block. Breaks never
// touch the timer, so they never count toward actual_minutes. One quiet
// notification per transition.
async function advancePomodoro(
  get: () => PlannerState,
  set: (partial: Partial<PlannerState>) => void,
): Promise<void> {
  const { pomodoro, focusTaskId } = get();
  if (!pomodoro.active) return;
  if (pomodoro.phase === "work") {
    // work -> break: fold the work minutes, then go idle for the break.
    const runningIds = collectRunningTaskIds(get());
    await repo.stopRunningTimers();
    await Promise.all(runningIds.map((id) => get().syncTaskFromDb(id)));
    set({
      pomodoro: {
        active: true,
        phase: "break",
        phaseEndsAt: Date.now() + POMODORO_BREAK_MIN * 60_000,
        pausedRemainingMs: null,
      },
    });
    void notify("Break time", "Step away for 5 min");
  } else {
    // break -> work: start a fresh work block (timer running again).
    if (focusTaskId != null) {
      await repo.startTimer(focusTaskId);
      await get().syncTaskFromDb(focusTaskId);
    }
    set({
      pomodoro: {
        active: true,
        phase: "work",
        phaseEndsAt: Date.now() + POMODORO_WORK_MIN * 60_000,
        pausedRemainingMs: null,
      },
    });
    void notify("Back to focus", "25 min work block");
  }
}

export const usePlanner = create<PlannerState>((set, get) => ({
  // UI prefs: read initial values from localStorage (defaults when absent),
  // write back on every toggle/set so they survive reloads on this device.
  inspectorCollapsed: prefs.readBool("workspaceInspectorCollapsed", false),
  toggleInspector: () =>
    set((s) => {
      const next = !s.inspectorCollapsed;
      prefs.write("workspaceInspectorCollapsed", next);
      return { inspectorCollapsed: next };
    }),

  inspectorTab:
    prefs.readString("inspectorTab", "timeline") === "inbox"
      ? "inbox"
      : "timeline",
  setInspectorTab: (tab) => {
    prefs.write("inspectorTab", tab);
    set({ inspectorTab: tab });
  },

  // Coerce the stored string to one of the two valid modes (anything else, e.g.
  // a stale or absent value, falls back to "week").
  viewMode: prefs.readString("viewMode", "week") === "day" ? "day" : "week",
  setViewMode: (mode) => {
    prefs.write("viewMode", mode);
    set({ viewMode: mode });
  },

  // Initial value mirrors what main.tsx applied synchronously to <html>.
  theme: normalizeTheme(prefs.readString("theme", DEFAULT_THEME)),
  setTheme: (id) => {
    const next = normalizeTheme(id);
    prefs.write("theme", next);
    applyTheme(next);
    set({ theme: next });
  },

  inspectorWidth: clamp(
    prefs.readNumber("inspectorWidth", INSPECTOR_DEFAULT_WIDTH),
    INSPECTOR_MIN_WIDTH,
    INSPECTOR_MAX_WIDTH,
  ),
  setInspectorWidth: (px) => {
    const next = clamp(px, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH);
    prefs.write("inspectorWidth", next);
    set({ inspectorWidth: next });
  },

  selectedDate: todayKey(),
  dayTasks: [],
  backlog: [],
  carryOver: [],
  loading: true,

  weekDays: [],
  weekTasks: {},
  weekLoading: true,

  detailTaskId: null,
  detailTask: null,
  detailComments: [],
  detailSubtasks: [],
  detailAttachments: [],

  focusTaskId: null,
  focusSubtasks: [],

  pomodoro: POMODORO_INACTIVE,

  openDetail: async (id) => {
    const inMemoryTask = findTaskAnywhere(get(), id) ?? null;
    set({
      detailTaskId: id,
      detailTask: inMemoryTask,
      detailComments: [],
      detailSubtasks: [],
      detailAttachments: [],
    });
    const [task, comments, subtasks, attachments] = await Promise.all([
      repo.fetchTaskById(id),
      repo.fetchComments(id),
      repo.fetchSubtasks(id),
      repo.fetchAttachments(id),
    ]);
    // Ignore if the modal was closed/switched while loading.
    if (get().detailTaskId === id)
      set({
        detailTask: task ?? inMemoryTask,
        detailComments: comments,
        detailSubtasks: subtasks,
        detailAttachments: attachments,
      });
  },

  closeDetail: () =>
    set({
      detailTaskId: null,
      detailTask: null,
      detailComments: [],
      detailSubtasks: [],
      detailAttachments: [],
    }),

  addComment: async (body) => {
    const id = get().detailTaskId;
    if (id == null) return;
    await repo.addComment(id, body);
    set({ detailComments: await repo.fetchComments(id) });
  },

  deleteComment: async (commentId) => {
    await repo.deleteComment(commentId);
    const id = get().detailTaskId;
    if (id != null) set({ detailComments: await repo.fetchComments(id) });
  },

  addSubtask: async (title) => {
    const id = get().detailTaskId;
    if (id == null) return;
    await repo.addSubtask(id, title);
    set({ detailSubtasks: await repo.fetchSubtasks(id) });
    await get().syncTaskFromDb(id);
  },

  toggleSubtask: async (sub) => {
    await repo.setSubtaskDone(sub.id, !sub.done);
    const detailId = get().detailTaskId;
    if (detailId === sub.task_id)
      set({ detailSubtasks: await repo.fetchSubtasks(sub.task_id) });
    const focusId = get().focusTaskId;
    if (focusId === sub.task_id)
      set({ focusSubtasks: await repo.fetchSubtasks(sub.task_id) });
    await get().syncTaskFromDb(sub.task_id);
  },

  deleteSubtask: async (subId) => {
    const id = get().detailTaskId;
    if (id == null) return;
    await repo.deleteSubtask(subId);
    set({ detailSubtasks: await repo.fetchSubtasks(id) });
    await get().syncTaskFromDb(id);
  },

  addAttachments: async (srcPaths) => {
    const id = get().detailTaskId;
    if (id == null || srcPaths.length === 0) return;
    for (const srcPath of srcPaths) {
      // The Rust command copies the file into attachments/<task_id>/ and returns
      // the row metadata; we persist it (the DB owns created_at).
      const meta = await invoke<{
        filename: string;
        rel_path: string;
        mime: string | null;
        size_bytes: number;
      }>("import_attachment", { taskId: id, srcPath });
      await repo.insertAttachment({
        task_id: id,
        filename: meta.filename,
        rel_path: meta.rel_path,
        mime: meta.mime,
        size_bytes: meta.size_bytes,
        created_at: new Date().toISOString(),
      });
    }
    if (get().detailTaskId === id)
      set({ detailAttachments: await repo.fetchAttachments(id) });
    await get().syncTaskFromDb(id);
  },

  deleteAttachment: async (attId) => {
    const att = get().detailAttachments.find((a) => a.id === attId);
    if (att) {
      // Best-effort file removal; the row delete is the source of truth.
      try {
        await invoke("delete_attachment_file", { relPath: att.rel_path });
      } catch (err) {
        console.error("Attachment file delete failed", err);
      }
    }
    await repo.deleteAttachment(attId);
    const id = get().detailTaskId;
    if (id != null) set({ detailAttachments: await repo.fetchAttachments(id) });
    if (id != null) await get().syncTaskFromDb(id);
  },

  openFocus: async (id) => {
    // Stop any prior session so its elapsed time is folded in exactly once,
    // then start the timer on the new task. startTimer also stops others, but we
    // call stop explicitly to make the "fold once" contract clear.
    const runningIds = collectRunningTaskIds(get());
    await repo.stopRunningTimers();
    await repo.startTimer(id);
    // Optimistically mark the new task as running so the emerald dot shows
    // immediately, before the background refresh reconciles.
    const startedAt = new Date().toISOString();
    set({
      ...patchTaskInBuckets(
        {
          dayTasks: get().dayTasks,
          backlog: get().backlog,
          carryOver: get().carryOver,
        },
        id,
        { timer_started_at: startedAt },
      ),
      weekTasks: patchTaskInWeek(get().weekTasks, id, {
        timer_started_at: startedAt,
      }),
      focusTaskId: id,
      focusSubtasks: [],
      // Switching the focused task stops any active pomodoro: the rhythm always
      // belongs to one task, so the user re-starts it for the new task. The
      // fresh startTimer above already owns the work timer for the new task.
      pomodoro: POMODORO_INACTIVE,
    });
    const subtasks = await repo.fetchSubtasks(id);
    // Ignore if focus was closed/switched while loading.
    if (get().focusTaskId === id) set({ focusSubtasks: subtasks });
    await Promise.all(
      [...new Set([...runningIds, id])].map((taskId) =>
        get().syncTaskFromDb(taskId),
      ),
    );
  },

  closeFocus: async () => {
    const runningIds = collectRunningTaskIds(get());
    await repo.stopRunningTimers();
    await Promise.all(runningIds.map((id) => get().syncTaskFromDb(id)));
    // Leaving focus also clears pomodoro so it never runs without a focused task.
    set({ focusTaskId: null, focusSubtasks: [], pomodoro: POMODORO_INACTIVE });
  },

  focusNext: async () => {
    const id = get().focusTaskId;
    if (id == null) return;
    const { queue, index } = buildFocusQueue(get(), id);
    if (queue.length === 0) return;
    if (index === -1) {
      // The focused task is not in the scheduled queue (entered from an
      // unscheduled task): jump to the first scheduled item of its day.
      await get().openFocus(queue[0].id);
      return;
    }
    const next = queue[index + 1];
    if (next) await get().openFocus(next.id);
  },

  focusPrev: async () => {
    const id = get().focusTaskId;
    if (id == null) return;
    const { queue, index } = buildFocusQueue(get(), id);
    // Unscheduled-entry: Prev does nothing (index === -1).
    if (queue.length === 0 || index <= 0) return;
    const prev = queue[index - 1];
    if (prev) await get().openFocus(prev.id);
  },

  completeFocus: async () => {
    const id = get().focusTaskId;
    if (id == null) return;
    // Capture the queue + current index BEFORE completing (completion may change
    // the task's done state and reorder things).
    const { queue, index } = buildFocusQueue(get(), id);
    const current = findTaskAnywhere(get(), id);
    if (!current) {
      await get().closeFocus();
      return;
    }
    // toggleComplete stops the running timer and folds the elapsed time in.
    await get().toggleComplete(current);
    // Advance to the next item in the pre-captured queue order whose status is
    // not done. Start searching after the current index (or from the start if
    // the current task was not in the queue).
    const startAt = index === -1 ? 0 : index + 1;
    for (let i = startAt; i < queue.length; i++) {
      const candidate = findTaskAnywhere(get(), queue[i].id);
      if (candidate && candidate.status !== "done") {
        await get().openFocus(candidate.id);
        return;
      }
    }
    await get().closeFocus();
  },

  toggleFocusSubtask: async (sub) => {
    await repo.setSubtaskDone(sub.id, !sub.done);
    const id = get().focusTaskId;
    if (id != null) set({ focusSubtasks: await repo.fetchSubtasks(id) });
    await get().syncTaskFromDb(sub.task_id);
  },

  // Enter the pomodoro rhythm on the focused task: begin a WORK block. Ensures
  // the focus timer is running (so work time is tracked) and primes notification
  // permission up front so the first phase change can notify silently.
  startPomodoro: async () => {
    const id = get().focusTaskId;
    if (id == null) return;
    // WORK = timer running; make sure it is.
    const task = findTaskAnywhere(get(), id);
    if (task && !task.timer_started_at) {
      await repo.startTimer(id);
      await get().syncTaskFromDb(id);
    }
    set({
      pomodoro: {
        active: true,
        phase: "work",
        phaseEndsAt: Date.now() + POMODORO_WORK_MIN * 60_000,
        pausedRemainingMs: null,
      },
    });
    // Best-effort permission request so the first transition notifies quietly.
    void (async () => {
      try {
        if (!(await isPermissionGranted())) await requestPermission();
      } catch (err) {
        console.error("Notification permission request failed", err);
      }
    })();
  },

  // Exit pomodoro back to a plain focus session. If we were on a break the work
  // timer is off, so restart it so normal session tracking continues.
  stopPomodoro: async () => {
    const { pomodoro, focusTaskId } = get();
    if (pomodoro.phase === "break" && focusTaskId != null) {
      await repo.startTimer(focusTaskId);
      await get().syncTaskFromDb(focusTaskId);
    }
    set({ pomodoro: POMODORO_INACTIVE });
  },

  // Freeze the countdown. During WORK, fold the partial work block into
  // actual_minutes so paused time never counts as worked time.
  pausePomodoro: async () => {
    const { pomodoro } = get();
    if (!pomodoro.active || pomodoro.pausedRemainingMs != null) return;
    const remaining = Math.max(0, (pomodoro.phaseEndsAt ?? Date.now()) - Date.now());
    if (pomodoro.phase === "work") {
      const runningIds = collectRunningTaskIds(get());
      await repo.stopRunningTimers();
      await Promise.all(runningIds.map((id) => get().syncTaskFromDb(id)));
    }
    set({
      pomodoro: { ...pomodoro, phaseEndsAt: null, pausedRemainingMs: remaining },
    });
  },

  // Resume the countdown from the frozen remainder. During WORK, restart the
  // work timer so tracking continues.
  resumePomodoro: async () => {
    const { pomodoro, focusTaskId } = get();
    if (!pomodoro.active || pomodoro.pausedRemainingMs == null) return;
    if (pomodoro.phase === "work" && focusTaskId != null) {
      await repo.startTimer(focusTaskId);
      await get().syncTaskFromDb(focusTaskId);
    }
    set({
      pomodoro: {
        ...pomodoro,
        phaseEndsAt: Date.now() + pomodoro.pausedRemainingMs,
        pausedRemainingMs: null,
      },
    });
  },

  // Immediately advance to the other phase (same transitions as auto-advance).
  skipPhase: async () => {
    await advancePomodoro(get, set);
  },

  // Auto-advance when the current phase's deadline has passed. Driven by the 1s
  // Zen tick so transitions fire even with the window focused. Cheap when idle.
  advancePomodoroIfDue: async () => {
    const { pomodoro } = get();
    if (
      !pomodoro.active ||
      pomodoro.pausedRemainingMs != null ||
      pomodoro.phaseEndsAt == null ||
      Date.now() < pomodoro.phaseEndsAt
    ) {
      return;
    }
    await advancePomodoro(get, set);
  },

  syncTaskFromDb: async (id) => {
    // Any older broad refresh began before this canonical mutation result and
    // must not overwrite it when its slower query completes.
    refreshRequestSeq += 1;
    const task = await repo.fetchTaskById(id);
    weekProjectionVersion += 1;
    set((s) => ({
      ...reconcileTaskProjection({
        selectedDate: s.selectedDate,
        dayTasks: s.dayTasks,
        backlog: s.backlog,
        carryOver: s.carryOver,
        weekTasks: s.weekTasks,
        taskId: id,
        task,
        todayKey: todayKey(),
      }),
      ...(s.detailTaskId === id ? { detailTask: task ?? null } : {}),
    }));
  },

  refresh: async () => {
    const requestId = ++refreshRequestSeq;
    const date = get().selectedDate;
    const [dayTasks, backlog, carryOver] = await Promise.all([
      repo.fetchTasksForDate(date),
      repo.fetchBacklog(),
      repo.fetchCarryOver(todayKey()),
    ]);
    if (requestId !== refreshRequestSeq || get().selectedDate !== date) return;
    weekProjectionVersion += 1;
    set((s) => ({
      dayTasks,
      backlog,
      carryOver,
      weekTasks: Object.prototype.hasOwnProperty.call(s.weekTasks, date)
        ? { ...s.weekTasks, [date]: dayTasks }
        : s.weekTasks,
      loading: false,
    }));
  },

  setDate: async (date) => {
    // Seed dayTasks from the already-loaded week map so the timeline switches to
    // the new day's blocks on the very next render (no flash of the old day),
    // then reconcile from disk in the background.
    const seeded = get().weekTasks[date];
    set({
      selectedDate: date,
      loading: seeded == null,
      ...(seeded != null ? { dayTasks: seeded } : {}),
    });
    await get().refresh();
  },

  loadWeek: async () => {
    const requestId = ++loadWeekRequestSeq;
    const days = dayRange(shiftDay(todayKey(), -WEEK_PAST_DAYS), WEEK_INITIAL_DAYS);
    set({ weekDays: days, weekLoading: true });
    while (requestId === loadWeekRequestSeq) {
      const projectionVersion = weekProjectionVersion;
      const rows = await repo.fetchTasksForRange(days[0], days[days.length - 1]);
      if (requestId !== loadWeekRequestSeq) return;
      // A task mutation landed while this range query was in flight. Query the
      // range again rather than replacing the reconciled projection with the
      // older snapshot.
      if (projectionVersion !== weekProjectionVersion) continue;
      set({ weekTasks: groupByDay(rows, days), weekLoading: false });
      return;
    }
  },

  extendWeek: async (extraDays = WEEK_EXTEND_DAYS) => {
    const current = get().weekDays;
    if (current.length === 0) {
      await get().loadWeek();
      return;
    }
    const start = shiftDay(current[current.length - 1], 1);
    const added = dayRange(start, extraDays);
    let rows: Task[];
    while (true) {
      const projectionVersion = weekProjectionVersion;
      rows = await repo.fetchTasksForRange(added[0], added[added.length - 1]);
      if (projectionVersion === weekProjectionVersion) break;
    }
    const grouped = groupByDay(rows, added);
    set({
      weekDays: [...current, ...added],
      weekTasks: { ...get().weekTasks, ...grouped },
    });
  },

  moveTaskWeek: async (id, toDate) => {
    const before = get().weekTasks;
    const beforeBacklog = get().backlog;
    const beforeDayTasks = get().dayTasks;

    // Find the task and its source list (a loaded day or the backlog/inbox).
    let task: Task | undefined;
    for (const key of Object.keys(before)) {
      const found = before[key].find((t) => t.id === id);
      if (found) {
        task = found;
        break;
      }
    }
    if (!task) task = beforeBacklog.find((t) => t.id === id);
    if (!task) return;

    const fields: Partial<Task> = {
      planned_date: toDate,
      status: toDate ? "planned" : "backlog",
    };
    // Moving to the Inbox clears any timeline placement (mirrors moveTask).
    if (!toDate) fields.scheduled_start = null;
    const moved: Task = { ...task, ...fields };

    // Remove the row from every source list, then insert it into its target.
    const nextWeek: Record<string, Task[]> = {};
    for (const key of Object.keys(before)) {
      nextWeek[key] = before[key].filter((t) => t.id !== id);
    }
    let nextBacklog = beforeBacklog.filter((t) => t.id !== id);
    if (toDate) {
      // Append to the destination day (only if that day is loaded).
      if (nextWeek[toDate]) nextWeek[toDate] = [...nextWeek[toDate], moved];
    } else {
      nextBacklog = [...nextBacklog, moved];
    }

    // Keep the selected day's `dayTasks` (which the Timeline reads) in sync
    // synchronously so moving a row onto/off the selected day's column updates
    // the timeline with no flash and no disk reload.
    const sel = get().selectedDate;
    let nextDayTasks = beforeDayTasks;
    if (task.planned_date === sel && toDate !== sel) {
      nextDayTasks = beforeDayTasks.filter((t) => t.id !== id);
    } else if (toDate === sel && task.planned_date !== sel) {
      nextDayTasks = [...beforeDayTasks.filter((t) => t.id !== id), moved];
    }

    set({ weekTasks: nextWeek, backlog: nextBacklog, dayTasks: nextDayTasks });
    try {
      await repo.updateTask(
        id,
        fields as Record<string, string | number | null>,
      );
      await get().syncTaskFromDb(id);
    } catch (err) {
      console.error("Week move failed; rolling back", err);
      set({
        weekTasks: before,
        backlog: beforeBacklog,
        dayTasks: beforeDayTasks,
      });
    }
  },

  addToWeekDay: async (date, title) => {
    await repo.insertTask({ title, plannedDate: date });
    // Reload just this day's column and the day view if it is showing `date`.
    const rows = await repo.fetchTasksForRange(date, date);
    weekProjectionVersion += 1;
    set({ weekTasks: { ...get().weekTasks, [date]: rows } });
    if (get().selectedDate === date) await get().refresh();
  },

  // Optimistic mutation: patch the in-memory task synchronously so the UI is
  // correct on the very next render, then persist in the background. No refresh
  // on success, so the already-correct block never moves (the source of the
  // drop flash). On failure, roll back to the pre-mutation snapshot and reload
  // the truth from disk.
  applyOptimistic: async (id, fields, persist) => {
    refreshRequestSeq += 1;
    const before: TaskBuckets = {
      dayTasks: get().dayTasks,
      backlog: get().backlog,
      carryOver: get().carryOver,
    };
    const beforeWeek = get().weekTasks;
    const beforeDetailTask = get().detailTask;
    // Patch the day buckets and the week map in place so both views show the
    // edit on the next render. This handles in-place edits (complete, estimate,
    // schedule); cross-column moves use moveTaskWeek to relocate rows.
    set({
      ...patchTaskInBuckets(before, id, fields),
      weekTasks: patchTaskInWeek(beforeWeek, id, fields),
      ...(beforeDetailTask?.id === id
        ? { detailTask: { ...beforeDetailTask, ...fields } }
        : {}),
    });
    try {
      await persist();
    } catch (err) {
      console.error("Optimistic update failed; rolling back", err);
      set({ ...before, weekTasks: beforeWeek, detailTask: beforeDetailTask });
      await get().refresh();
    }
  },

  addToDay: async (title, estimateMinutes) => {
    await repo.insertTask({
      title,
      plannedDate: get().selectedDate,
      estimateMinutes,
    });
    await get().refresh();
  },

  addToBacklog: async (title, estimateMinutes) => {
    await repo.insertTask({ title, plannedDate: null, estimateMinutes });
    await get().refresh();
  },

  editTask: async (id, fields) => {
    // Patch in place first so edits that change visible geometry (e.g. a block
    // resize committing estimate_minutes) take effect on the next render with no
    // revert-then-snap. Canonical sync after persist reconciles derived data and
    // list membership.
    await get().applyOptimistic(id, fields as Partial<Task>, async () => {
      await repo.updateTask(id, fields);
      await get().syncTaskFromDb(id);
    });
  },

  editTaskQuiet: async (id, fields) => {
    await get().applyOptimistic(id, fields as Partial<Task>, async () => {
      await repo.updateTask(id, fields);
      await get().syncTaskFromDb(id);
    });
  },

  toggleComplete: async (task) => {
    if (task.status === "done") {
      // Re-open: status follows whether the task still belongs to a day.
      const fields = {
        status: (task.planned_date ? "planned" : "backlog") as Task["status"],
        completed_at: null,
      };
      await get().applyOptimistic(task.id, fields, async () => {
        await repo.updateTask(task.id, fields);
        await get().syncTaskFromDb(task.id);
      });
    } else {
      // Completing also stops a running timer so the actual time is captured.
      // The stored actual_minutes is recomputed in SQL, then canonical sync
      // reconciles timer + derived values across projections.
      const wasRunning = !!task.timer_started_at;
      const fields = {
        status: "done" as Task["status"],
        completed_at: new Date().toISOString(),
        timer_started_at: wasRunning ? null : task.timer_started_at,
      };
      await get().applyOptimistic(task.id, fields, async () => {
        if (wasRunning) await repo.stopRunningTimers();
        await repo.updateTask(task.id, {
          status: fields.status,
          completed_at: fields.completed_at,
        });
        await get().syncTaskFromDb(task.id);
      });
    }
  },

  removeTask: async (id) => {
    // Drop from the week map in memory so a delete from a Week column takes
    // effect immediately (refresh only reloads the Day buckets + backlog).
    set({ weekTasks: removeTaskFromWeek(get().weekTasks, id) });
    // db.deleteTask clears the attachment rows; also remove the files on disk
    // (best-effort, ignore errors so a delete is never blocked by the FS).
    await repo.deleteTask(id);
    try {
      await invoke("delete_attachments_dir", { taskId: id });
    } catch (err) {
      console.error("Attachment dir cleanup failed", err);
    }
    await get().syncTaskFromDb(id);
  },

  reorder: async (_bucket, orderedIds) => {
    // Reflect the new order in memory immediately so the rows do not snap back
    // to the old order for a frame while the per-row UPDATEs run.
    const order = new Map(orderedIds.map((id, i) => [id, i]));
    const sortByOrder = (tasks: Task[]) =>
      tasks
        .map((t) => (order.has(t.id) ? { ...t, sort_order: order.get(t.id)! } : t))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const before = {
      dayTasks: get().dayTasks,
      backlog: get().backlog,
      carryOver: get().carryOver,
    };
    const beforeWeek = get().weekTasks;
    // Apply the new order to every week column too, so reordering any day column
    // (not just the selected day's dayTasks) takes effect on the next render.
    const nextWeek: Record<string, Task[]> = {};
    for (const key of Object.keys(beforeWeek)) {
      nextWeek[key] = sortByOrder(beforeWeek[key]);
    }
    set({
      dayTasks: sortByOrder(before.dayTasks),
      backlog: sortByOrder(before.backlog),
      carryOver: before.carryOver,
      weekTasks: nextWeek,
    });
    try {
      await repo.reorderTasks(orderedIds);
      weekProjectionVersion += 1;
      // A range load may have completed during persistence. Reapply the known
      // order to the latest projections so the optimistic result remains true.
      set((s) => {
        const weekTasks: Record<string, Task[]> = {};
        for (const key of Object.keys(s.weekTasks)) {
          weekTasks[key] = sortByOrder(s.weekTasks[key]);
        }
        return {
          dayTasks: sortByOrder(s.dayTasks),
          backlog: sortByOrder(s.backlog),
          weekTasks,
        };
      });
    } catch (err) {
      console.error("Reorder failed; rolling back", err);
      set({ ...before, weekTasks: beforeWeek });
      await get().refresh();
    }
  },

  moveTask: async (id, toDate) => {
    const fields: Partial<Task> = {
      planned_date: toDate,
      status: toDate ? "planned" : "backlog",
    };
    // Moving back to the backlog clears any timeline placement.
    if (!toDate) fields.scheduled_start = null;
    // Cross-bucket move: the optimistic patch updates the row's fields in place,
    // then canonical sync places it in the right projections after persistence.
    await get().applyOptimistic(id, fields, async () => {
      await repo.updateTask(id, fields as Record<string, string | number | null>);
      await get().syncTaskFromDb(id);
    });
  },

  scheduleTask: async (id, startTime) => {
    const task = [
      ...get().dayTasks,
      ...get().backlog,
      ...get().carryOver,
    ].find((t) => t.id === id);
    const selectedDate = get().selectedDate;
    const fields: Partial<Task> = {
      planned_date: selectedDate,
      scheduled_start: startTime,
    };
    // A backlog task pulled onto the timeline becomes a planned task.
    if (task?.status === "backlog") fields.status = "planned";
    await get().applyOptimistic(id, fields, async () => {
      await repo.updateTask(id, fields as Record<string, string | number | null>);
      await get().syncTaskFromDb(id);
    });
  },

  scheduleOnSelected: async (id, startTime) => {
    const selectedDate = get().selectedDate;
    const beforeWeek = get().weekTasks;
    const before: TaskBuckets = {
      dayTasks: get().dayTasks,
      backlog: get().backlog,
      carryOver: get().carryOver,
    };
    const beforeBacklog = get().backlog;

    // Find the task wherever it currently lives: the day buckets, the backlog,
    // or any loaded week column.
    let task: Task | undefined = [
      ...before.dayTasks,
      ...before.backlog,
      ...before.carryOver,
    ].find((t) => t.id === id);
    if (!task) {
      for (const key of Object.keys(beforeWeek)) {
        const found = beforeWeek[key].find((t) => t.id === id);
        if (found) {
          task = found;
          break;
        }
      }
    }
    if (!task) return;

    const movingDay = task.planned_date !== selectedDate;
    const fields: Partial<Task> = {
      planned_date: selectedDate,
      scheduled_start: startTime,
      status: "planned",
    };
    const moved: Task = { ...task, ...fields };

    // Relocate the row in the week map: drop it from every column, then append
    // it to the selected day's column (if that day is loaded). This keeps the
    // source column from showing it and the target column / timeline in sync.
    const nextWeek: Record<string, Task[]> = {};
    for (const key of Object.keys(beforeWeek)) {
      nextWeek[key] = beforeWeek[key].filter((t) => t.id !== id);
    }
    if (nextWeek[selectedDate]) {
      nextWeek[selectedDate] = [
        ...nextWeek[selectedDate].filter((t) => t.id !== id),
        moved,
      ];
    }

    // Day buckets: patch in place (handles the common "move an existing block on
    // the selected day" case), and pull the row in from the backlog if it came
    // from the Inbox so the selected day's dayTasks shows it immediately.
    const patchedBuckets = patchTaskInBuckets(before, id, fields);
    if (movingDay) {
      // The row was not on the selected day; make sure dayTasks contains it and
      // the backlog no longer does.
      const inDay = patchedBuckets.dayTasks.some((t) => t.id === id);
      if (!inDay) patchedBuckets.dayTasks = [...patchedBuckets.dayTasks, moved];
      patchedBuckets.backlog = patchedBuckets.backlog.filter(
        (t) => t.id !== id,
      );
    }

    set({ ...patchedBuckets, weekTasks: nextWeek });

    try {
      await repo.updateTask(
        id,
        fields as Record<string, string | number | null>,
      );
      await get().syncTaskFromDb(id);
    } catch (err) {
      console.error("Schedule on selected failed; rolling back", err);
      set({ ...before, backlog: beforeBacklog, weekTasks: beforeWeek });
    }
  },

  unscheduleTask: async (id) => {
    // The task stays on the same day, just leaves the timeline. Patch in place,
    // persist in the background, then reconcile from the canonical row.
    await get().applyOptimistic(id, { scheduled_start: null }, async () => {
      await repo.updateTask(id, { scheduled_start: null });
      await get().syncTaskFromDb(id);
    });
  },

  toggleTimer: async (task) => {
    const runningIds = collectRunningTaskIds(get());
    if (task.timer_started_at) {
      await repo.stopRunningTimers();
      await Promise.all(runningIds.map((id) => get().syncTaskFromDb(id)));
    } else {
      await repo.startTimer(task.id);
      await Promise.all(
        [...new Set([...runningIds, task.id])].map((id) =>
          get().syncTaskFromDb(id),
        ),
      );
    }
  },

  setActual: async (id, minutes) => {
    await repo.updateTask(id, { actual_minutes: Math.max(0, Math.round(minutes)) });
    await get().syncTaskFromDb(id);
  },

  moveToToday: async (id) => {
    await repo.updateTask(id, {
      planned_date: todayKey(),
      status: "planned",
      scheduled_start: null,
    });
    await get().syncTaskFromDb(id);
  },

  moveAllToToday: async (ids) => {
    const today = todayKey();
    await Promise.all(
      ids.map((id) =>
        repo.updateTask(id, {
          planned_date: today,
          status: "planned",
          scheduled_start: null,
        }),
      ),
    );
    await Promise.all(ids.map((id) => get().syncTaskFromDb(id)));
  },
}));
