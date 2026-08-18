import type { Task } from "../types";

export interface ReconcileTaskProjectionInput {
  selectedDate: string;
  dayTasks: Task[];
  backlog: Task[];
  carryOver: Task[];
  weekTasks: Record<string, Task[]>;
  taskId: number;
  task: Task | undefined;
  todayKey: string;
}

export interface ReconcileTaskProjectionResult {
  dayTasks: Task[];
  backlog: Task[];
  carryOver: Task[];
  weekTasks: Record<string, Task[]>;
}

function bySortOrderThenId(a: Task, b: Task): number {
  return a.sort_order - b.sort_order || a.id - b.id;
}

function sortedWithTask(list: Task[], task: Task): Task[] {
  return [...list, task].sort(bySortOrderThenId);
}

export function reconcileTaskProjection(
  input: ReconcileTaskProjectionInput,
): ReconcileTaskProjectionResult {
  const {
    selectedDate,
    dayTasks,
    backlog,
    carryOver,
    weekTasks,
    taskId,
    task,
    todayKey,
  } = input;

  const nextDay = dayTasks.filter((row) => row.id !== taskId);
  const nextBacklog = backlog.filter((row) => row.id !== taskId);
  const nextCarryOver = carryOver.filter((row) => row.id !== taskId);
  const nextWeek: Record<string, Task[]> = {};

  for (const key of Object.keys(weekTasks)) {
    nextWeek[key] = weekTasks[key].filter((row) => row.id !== taskId);
  }

  if (!task) {
    return {
      dayTasks: nextDay,
      backlog: nextBacklog,
      carryOver: nextCarryOver,
      weekTasks: nextWeek,
    };
  }

  const taskDate = task.planned_date;
  const isDone = task.status === "done";

  if (taskDate === selectedDate) {
    nextDay.push(task);
    nextDay.sort(bySortOrderThenId);
  }

  if (taskDate == null && !isDone) {
    nextBacklog.push(task);
    nextBacklog.sort(bySortOrderThenId);
  }

  if (taskDate != null && taskDate < todayKey && !isDone) {
    nextCarryOver.push(task);
    nextCarryOver.sort(bySortOrderThenId);
  }

  if (taskDate != null && Object.prototype.hasOwnProperty.call(nextWeek, taskDate)) {
    nextWeek[taskDate] = sortedWithTask(nextWeek[taskDate], task);
  }

  return {
    dayTasks: nextDay,
    backlog: nextBacklog,
    carryOver: nextCarryOver,
    weekTasks: nextWeek,
  };
}