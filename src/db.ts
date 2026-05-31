import Database from "@tauri-apps/plugin-sql";

// Single shared connection to the SQLite database. The file lives in the app's
// data directory; migrations are defined Rust-side in src-tauri/src/lib.rs.
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:planner.db");
  }
  return dbPromise;
}
