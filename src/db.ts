import Database from "@tauri-apps/plugin-sql";
import type { Comment, Subtask, Task } from "./types";

// Single shared connection to the SQLite database. The file lives in the app's
// data directory; the schema/migrations are defined Rust-side in
// src-tauri/src/lib.rs.
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:planner.db");
  }
  return dbPromise;
}

const COLUMNS =
  "id, title, notes, status, planned_date, scheduled_start, estimate_minutes, actual_minutes, sort_order, created_at, completed_at, timer_started_at";

// Correlated subtask counts, appended to task selects for the row progress chip.
const SUBTASK_COUNTS =
  ", (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = tasks.id) AS subtask_total" +
  ", (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = tasks.id AND s.done = 1) AS subtask_done";

export async function fetchTasksForDate(date: string): Promise<Task[]> {
  const db = await getDb();
  return db.select<Task[]>(
    `SELECT ${COLUMNS}${SUBTASK_COUNTS} FROM tasks WHERE planned_date = $1 ORDER BY sort_order ASC, id ASC`,
    [date],
  );
}

export async function fetchBacklog(): Promise<Task[]> {
  const db = await getDb();
  return db.select<Task[]>(
    `SELECT ${COLUMNS}${SUBTASK_COUNTS} FROM tasks WHERE planned_date IS NULL AND status != 'done' ORDER BY sort_order ASC, id ASC`,
  );
}

// Unfinished tasks dated before `today` (carried over from previous days).
export async function fetchCarryOver(today: string): Promise<Task[]> {
  const db = await getDb();
  return db.select<Task[]>(
    `SELECT ${COLUMNS}${SUBTASK_COUNTS} FROM tasks
       WHERE planned_date IS NOT NULL AND planned_date < $1 AND status != 'done'
       ORDER BY planned_date ASC, sort_order ASC`,
    [today],
  );
}

export interface NewTask {
  title: string;
  plannedDate: string | null;
  estimateMinutes?: number | null;
  notes?: string | null;
}

export async function insertTask(input: NewTask): Promise<void> {
  const db = await getDb();
  const status = input.plannedDate ? "planned" : "backlog";

  // Append to the end of its bucket (a given day, or the backlog).
  const bucketClause = input.plannedDate
    ? "planned_date = $1"
    : "planned_date IS NULL";
  const bucketArgs = input.plannedDate ? [input.plannedDate] : [];
  const maxRows = await db.select<{ next: number }[]>(
    `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks WHERE ${bucketClause}`,
    bucketArgs,
  );
  const sortOrder = maxRows[0]?.next ?? 0;

  await db.execute(
    `INSERT INTO tasks
       (title, notes, status, planned_date, estimate_minutes, actual_minutes, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7)`,
    [
      input.title,
      input.notes ?? null,
      status,
      input.plannedDate,
      input.estimateMinutes ?? null,
      sortOrder,
      new Date().toISOString(),
    ],
  );
}

// Generic field update. Keys must be valid column names.
export async function updateTask(
  id: number,
  fields: Record<string, string | number | null>,
): Promise<void> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const db = await getDb();
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => fields[k]);
  await db.execute(`UPDATE tasks SET ${setClause} WHERE id = $${keys.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM comments WHERE task_id = $1", [id]);
  await db.execute("DELETE FROM subtasks WHERE task_id = $1", [id]);
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function fetchSubtasks(taskId: number): Promise<Subtask[]> {
  const db = await getDb();
  return db.select<Subtask[]>(
    "SELECT id, task_id, title, done, sort_order, created_at FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC, id ASC",
    [taskId],
  );
}

export async function addSubtask(taskId: number, title: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ next: number }[]>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM subtasks WHERE task_id = $1",
    [taskId],
  );
  await db.execute(
    "INSERT INTO subtasks (task_id, title, done, sort_order, created_at) VALUES ($1, $2, 0, $3, $4)",
    [taskId, title, rows[0]?.next ?? 0, new Date().toISOString()],
  );
}

export async function setSubtaskDone(id: number, done: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE subtasks SET done = $1 WHERE id = $2", [
    done ? 1 : 0,
    id,
  ]);
}

export async function deleteSubtask(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM subtasks WHERE id = $1", [id]);
}

export async function fetchComments(taskId: number): Promise<Comment[]> {
  const db = await getDb();
  return db.select<Comment[]>(
    "SELECT id, task_id, body, created_at FROM comments WHERE task_id = $1 ORDER BY created_at ASC, id ASC",
    [taskId],
  );
}

export async function addComment(taskId: number, body: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO comments (task_id, body, created_at) VALUES ($1, $2, $3)",
    [taskId, body, new Date().toISOString()],
  );
}

export async function deleteComment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM comments WHERE id = $1", [id]);
}

// Persist a new manual ordering for a set of tasks.
export async function reorderTasks(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE tasks SET sort_order = $1 WHERE id = $2", [
      i,
      orderedIds[i],
    ]);
  }
}

// Stop any running timer(s), folding elapsed whole minutes into actual_minutes.
// Done in SQL so the elapsed time is computed from the stored start timestamp,
// surviving app restarts.
export async function stopRunningTimers(): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE tasks
       SET actual_minutes = actual_minutes
             + CAST((julianday('now') - julianday(timer_started_at)) * 1440 AS INTEGER),
           timer_started_at = NULL
     WHERE timer_started_at IS NOT NULL`,
  );
}

// Start the timer on one task (after stopping any others).
export async function startTimer(id: number): Promise<void> {
  await stopRunningTimers();
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET timer_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1",
    [id],
  );
}
