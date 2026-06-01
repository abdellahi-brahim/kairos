use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

// Metadata returned to the frontend after a file is copied into the app's
// attachments store. The frontend persists this (plus a created_at) into the
// `attachments` table.
#[derive(Serialize)]
struct AttachmentMeta {
    filename: String,
    rel_path: String,
    mime: Option<String>,
    size_bytes: i64,
}

// Reduce an arbitrary file name to a safe, single path segment: keep the base
// name only (drop any directory parts), and replace anything that is not
// alphanumeric, dot, dash, or underscore with an underscore.
fn sanitize_filename(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

// Best-effort MIME guess from a file extension. Returns None when unknown; the
// frontend infers image-ness from the extension regardless.
fn mime_from_ext(name: &str) -> Option<String> {
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())?;
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "zip" => "application/zip",
        _ => return None,
    };
    Some(mime.to_string())
}

// Copy a source file into attachments/<task_id>/ under the app data dir, using a
// time-based unique prefix so two files with the same original name never clash.
// Returns the row metadata for the frontend to persist.
#[tauri::command]
fn import_attachment(
    app: tauri::AppHandle,
    task_id: i64,
    src_path: String,
) -> Result<AttachmentMeta, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let dest_dir = data_dir.join("attachments").join(task_id.to_string());
    fs::create_dir_all(&dest_dir).map_err(|e| format!("create_dir_all: {e}"))?;

    let original = Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let safe = sanitize_filename(&original);

    // Nanosecond timestamp keeps successive imports unique without a uuid crate.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let unique_name = format!("{nanos}_{safe}");
    let dest = dest_dir.join(&unique_name);

    fs::copy(&src_path, &dest).map_err(|e| format!("copy: {e}"))?;
    let size_bytes = fs::metadata(&dest)
        .map(|m| m.len() as i64)
        .map_err(|e| format!("metadata: {e}"))?;

    let rel_path = format!("attachments/{task_id}/{unique_name}");

    Ok(AttachmentMeta {
        filename: original,
        rel_path,
        mime: mime_from_ext(&safe),
        size_bytes,
    })
}

// Resolve `rel_path` under the app data dir and ensure it stays inside the
// attachments directory (reject path traversal), then delete the file. A missing
// file is treated as success.
fn resolve_in_attachments(app: &tauri::AppHandle, rel_path: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let attachments_root = data_dir.join("attachments");

    // We do not canonicalize the candidate (the file may already be gone), so
    // guard against traversal lexically: reject any absolute path or `..`
    // component before joining, then require the result to stay under the
    // attachments root.
    if Path::new(rel_path).is_absolute()
        || rel_path.split(['/', '\\']).any(|seg| seg == "..")
    {
        return Err("invalid path".to_string());
    }
    let candidate = data_dir.join(rel_path);
    if !candidate.starts_with(&attachments_root) {
        return Err("path escapes attachments dir".to_string());
    }
    Ok(candidate)
}

#[tauri::command]
fn delete_attachment_file(app: tauri::AppHandle, rel_path: String) -> Result<(), String> {
    let path = resolve_in_attachments(&app, &rel_path)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove_file: {e}")),
    }
}

#[tauri::command]
fn delete_attachments_dir(app: tauri::AppHandle, task_id: i64) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let dir = data_dir.join("attachments").join(task_id.to_string());
    match fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove_dir_all: {e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_tasks_table",
            sql: "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'backlog',
            planned_date TEXT,
            scheduled_start TEXT,
            estimate_minutes INTEGER,
            actual_minutes INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_timer_started_at",
            // Set while a task's timer is running; actual_minutes holds the
            // accumulated total committed when the timer stops.
            sql: "ALTER TABLE tasks ADD COLUMN timer_started_at TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_comments_table",
            sql: "CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_subtasks_table",
            sql: "CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_priority",
            // priority: 0 none, 1 low, 2 medium, 3 high.
            sql: "ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_tags",
            // tags: JSON array of strings, e.g. ["work","urgent"].
            sql: "ALTER TABLE tasks ADD COLUMN tags TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_attachments_table",
            sql: "CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, filename TEXT NOT NULL, rel_path TEXT NOT NULL, mime TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:planner.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            import_attachment,
            delete_attachment_file,
            delete_attachments_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
