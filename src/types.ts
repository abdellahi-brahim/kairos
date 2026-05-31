export type TaskStatus = "backlog" | "planned" | "done";

// Field names mirror the SQLite columns (see src-tauri/src/lib.rs) so rows from
// the SQL plugin map straight onto this shape with no translation layer.
export interface Task {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  planned_date: string | null; // "yyyy-MM-dd", null = backlog (no day assigned)
  scheduled_start: string | null; // "HH:mm" on planned_date, null = untimed
  estimate_minutes: number | null;
  actual_minutes: number;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
  timer_started_at: string | null; // set while the timer is running (ISO), else null
}
