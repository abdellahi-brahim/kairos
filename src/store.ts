import { create } from "zustand";
import type { Comment, Subtask, Task } from "./types";
import * as repo from "./db";
import { todayKey } from "./lib/date";

type Bucket = "day" | "backlog";

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
    await repo.updateTask(id, fields);
    await get().refresh();
  },

  editTaskQuiet: async (id, fields) => {
    await repo.updateTask(id, fields);
  },

  toggleComplete: async (task) => {
    if (task.status === "done") {
      // Re-open: status follows whether the task still belongs to a day.
      await repo.updateTask(task.id, {
        status: task.planned_date ? "planned" : "backlog",
        completed_at: null,
      });
    } else {
      // Completing also stops a running timer so the actual time is captured.
      if (task.timer_started_at) await repo.stopRunningTimers();
      await repo.updateTask(task.id, {
        status: "done",
        completed_at: new Date().toISOString(),
      });
    }
    await get().refresh();
  },

  removeTask: async (id) => {
    await repo.deleteTask(id);
    await get().refresh();
  },

  reorder: async (_bucket, orderedIds) => {
    await repo.reorderTasks(orderedIds);
    await get().refresh();
  },

  moveTask: async (id, toDate) => {
    const fields: Record<string, string | number | null> = {
      planned_date: toDate,
      status: toDate ? "planned" : "backlog",
    };
    // Moving back to the backlog clears any timeline placement.
    if (!toDate) fields.scheduled_start = null;
    await repo.updateTask(id, fields);
    await get().refresh();
  },

  scheduleTask: async (id, startTime) => {
    const task = [...get().dayTasks, ...get().backlog].find((t) => t.id === id);
    const fields: Record<string, string | number | null> = {
      planned_date: get().selectedDate,
      scheduled_start: startTime,
    };
    // A backlog task pulled onto the timeline becomes a planned task.
    if (task?.status === "backlog") fields.status = "planned";
    await repo.updateTask(id, fields);
    await get().refresh();
  },

  unscheduleTask: async (id) => {
    await repo.updateTask(id, { scheduled_start: null });
    await get().refresh();
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
