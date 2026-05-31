import { create } from "zustand";
import type { Comment, Subtask, Task } from "./types";
import * as repo from "./db";
import { todayKey } from "./lib/date";

type Bucket = "day" | "backlog";

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

interface PlannerState {
  selectedDate: string;
  dayTasks: Task[];
  backlog: Task[];
  carryOver: Task[];
  loading: boolean;

  // Task detail modal
  detailTaskId: number | null;
  detailComments: Comment[];
  detailSubtasks: Subtask[];
  openDetail: (id: number) => Promise<void>;
  closeDetail: () => void;
  addComment: (body: string) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  addSubtask: (title: string) => Promise<void>;
  toggleSubtask: (sub: Subtask) => Promise<void>;
  deleteSubtask: (id: number) => Promise<void>;

  refresh: () => Promise<void>;
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
  unscheduleTask: (id: number) => Promise<void>;
  toggleTimer: (task: Task) => Promise<void>;
  setActual: (id: number, minutes: number) => Promise<void>;
  moveToToday: (id: number) => Promise<void>;
  moveAllToToday: (ids: number[]) => Promise<void>;
}

export const usePlanner = create<PlannerState>((set, get) => ({
  selectedDate: todayKey(),
  dayTasks: [],
  backlog: [],
  carryOver: [],
  loading: true,

  detailTaskId: null,
  detailComments: [],
  detailSubtasks: [],

  openDetail: async (id) => {
    set({ detailTaskId: id, detailComments: [], detailSubtasks: [] });
    const [comments, subtasks] = await Promise.all([
      repo.fetchComments(id),
      repo.fetchSubtasks(id),
    ]);
    // Ignore if the modal was closed/switched while loading.
    if (get().detailTaskId === id) set({ detailComments: comments, detailSubtasks: subtasks });
  },

  closeDetail: () =>
    set({ detailTaskId: null, detailComments: [], detailSubtasks: [] }),

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
    await get().refresh(); // update row progress chip
  },

  toggleSubtask: async (sub) => {
    await repo.setSubtaskDone(sub.id, !sub.done);
    const id = get().detailTaskId;
    if (id != null) set({ detailSubtasks: await repo.fetchSubtasks(id) });
    await get().refresh();
  },

  deleteSubtask: async (subId) => {
    await repo.deleteSubtask(subId);
    const id = get().detailTaskId;
    if (id != null) set({ detailSubtasks: await repo.fetchSubtasks(id) });
    await get().refresh();
  },

  refresh: async () => {
    const date = get().selectedDate;
    const [dayTasks, backlog, carryOver] = await Promise.all([
      repo.fetchTasksForDate(date),
      repo.fetchBacklog(),
      repo.fetchCarryOver(todayKey()),
    ]);
    set({ dayTasks, backlog, carryOver, loading: false });
  },

  setDate: async (date) => {
    set({ selectedDate: date, loading: true });
    await get().refresh();
  },

  // Optimistic mutation: patch the in-memory task synchronously so the UI is
  // correct on the very next render, then persist in the background. No refresh
  // on success, so the already-correct block never moves (the source of the
  // drop flash). On failure, roll back to the pre-mutation snapshot and reload
  // the truth from disk.
  applyOptimistic: async (id, fields, persist) => {
    const before: TaskBuckets = {
      dayTasks: get().dayTasks,
      backlog: get().backlog,
      carryOver: get().carryOver,
    };
    set(patchTaskInBuckets(before, id, fields));
    try {
      await persist();
    } catch (err) {
      console.error("Optimistic update failed; rolling back", err);
      set(before);
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
    // revert-then-snap. Refresh afterwards to reconcile derived data (subtask
    // chips) and any list membership the edit may affect.
    await get().applyOptimistic(id, fields as Partial<Task>, async () => {
      await repo.updateTask(id, fields);
      await get().refresh();
    });
  },

  editTaskQuiet: async (id, fields) => {
    await repo.updateTask(id, fields);
  },

  toggleComplete: async (task) => {
    if (task.status === "done") {
      // Re-open: status follows whether the task still belongs to a day.
      const fields = {
        status: (task.planned_date ? "planned" : "backlog") as Task["status"],
        completed_at: null,
      };
      await get().applyOptimistic(task.id, fields, () =>
        repo.updateTask(task.id, fields),
      );
    } else {
      // Completing also stops a running timer so the actual time is captured.
      // The stored actual_minutes is recomputed in SQL, so refresh afterwards to
      // pick up the folded-in elapsed time (only when a timer was running).
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
        if (wasRunning) await get().refresh();
      });
    }
  },

  removeTask: async (id) => {
    await repo.deleteTask(id);
    await get().refresh();
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
    set({
      dayTasks: sortByOrder(before.dayTasks),
      backlog: sortByOrder(before.backlog),
      carryOver: before.carryOver,
    });
    try {
      await repo.reorderTasks(orderedIds);
    } catch (err) {
      console.error("Reorder failed; rolling back", err);
      set(before);
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
    // but the row needs to appear in the other bucket too. Persist then refresh
    // so it lands in the right list; the patch keeps the moment-of-drop frame
    // consistent (no stale status flicker) while the reload completes.
    await get().applyOptimistic(id, fields, async () => {
      await repo.updateTask(id, fields as Record<string, string | number | null>);
      await get().refresh();
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
    // If the task already lives on the selected day (the common case: moving an
    // existing block), the optimistic patch alone puts it at its final slot, so
    // no reload is needed and the block never flashes at its old position.
    // A task arriving from the backlog or another day must also move buckets, so
    // reload after persisting to land it in dayTasks.
    const needsReload =
      !task || task.planned_date !== selectedDate;
    await get().applyOptimistic(id, fields, async () => {
      await repo.updateTask(id, fields as Record<string, string | number | null>);
      if (needsReload) await get().refresh();
    });
  },

  unscheduleTask: async (id) => {
    // The task stays on the same day, just leaves the timeline. Patch in place,
    // persist in the background; no reload needed.
    await get().applyOptimistic(id, { scheduled_start: null }, () =>
      repo.updateTask(id, { scheduled_start: null }),
    );
  },

  toggleTimer: async (task) => {
    if (task.timer_started_at) {
      await repo.stopRunningTimers();
    } else {
      await repo.startTimer(task.id);
    }
    await get().refresh();
  },

  setActual: async (id, minutes) => {
    await repo.updateTask(id, { actual_minutes: Math.max(0, Math.round(minutes)) });
    await get().refresh();
  },

  moveToToday: async (id) => {
    await repo.updateTask(id, {
      planned_date: todayKey(),
      status: "planned",
      scheduled_start: null,
    });
    await get().refresh();
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
    await get().refresh();
  },
}));
