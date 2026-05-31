import Database from "@tauri-apps/plugin-sql";
import type { Task } from "./types";

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
  "id, title, notes, status, planned_date, scheduled_start, estimate_minutes, actual_minutes, sort_order, created_at, completed_at";

export async function fetchTasksForDate(date: string): Promise<Task[]> {
  const db = await getDb();
  return db.select<Task[]>(
    `SELECT ${COLUMNS} FROM tasks WHERE planned_date = $1 ORDER BY sort_order ASC, id ASC`,
    [date],
  );
}

export async function fetchBacklog(): Promise<Task[]> {
  const db = await getDb();
  return db.select<Task[]>(
    `SELECT ${COLUMNS} FROM tasks WHERE planned_date IS NULL AND status != 'done' ORDER BY sort_order ASC, id ASC`,
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
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
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
