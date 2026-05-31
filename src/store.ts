import { create } from "zustand";
import type { Task } from "./types";
import * as repo from "./db";
import { todayKey } from "./lib/date";

type Bucket = "day" | "backlog";

interface PlannerState {
  selectedDate: string;
  dayTasks: Task[];
  backlog: Task[];
  loading: boolean;

  refresh: () => Promise<void>;
  setDate: (date: string) => Promise<void>;

  addToDay: (title: string, estimateMinutes?: number | null) => Promise<void>;
  addToBacklog: (title: string, estimateMinutes?: number | null) => Promise<void>;
  editTask: (
    id: number,
    fields: Record<string, string | number | null>,
  ) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  reorder: (bucket: Bucket, orderedIds: number[]) => Promise<void>;
  moveTask: (id: number, toDate: string | null) => Promise<void>;
}

export const usePlanner = create<PlannerState>((set, get) => ({
  selectedDate: todayKey(),
  dayTasks: [],
  backlog: [],
  loading: true,

  refresh: async () => {
    const date = get().selectedDate;
    const [dayTasks, backlog] = await Promise.all([
      repo.fetchTasksForDate(date),
      repo.fetchBacklog(),
    ]);
    set({ dayTasks, backlog, loading: false });
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

  toggleComplete: async (task) => {
    if (task.status === "done") {
      // Re-open: status follows whether the task still belongs to a day.
      await repo.updateTask(task.id, {
        status: task.planned_date ? "planned" : "backlog",
        completed_at: null,
      });
    } else {
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
}));
