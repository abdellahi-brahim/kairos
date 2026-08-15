# Kairos

Kairos is a desktop-first daily planning app built with Tauri, React, TypeScript, and SQLite.

## What It Does

- Manage tasks in day and backlog buckets
- Plan work across a week strip with drag and drop
- Schedule tasks on a timeline
- Track actual time with task timers
- Use Zen mode and Pomodoro flow for focused execution
- Add task comments, subtasks, tags, and file attachments
- Run a lightweight floating focus widget window

## Tech Stack

- Frontend: React 19, Vite 7, TypeScript 5, Zustand
- Desktop shell: Tauri 2
- Storage: SQLite via tauri-plugin-sql

## Requirements

- Node.js 22+
- pnpm 10+
- Rust toolchain (stable)
- Platform build prerequisites for Tauri

## Local Development

Install dependencies:

```bash
pnpm install
```

Run web UI only:

```bash
pnpm dev
```

Run desktop app in dev mode:

```bash
pnpm tauri dev
```

## Quality Checks

Run unit tests:

```bash
pnpm test
```

Run production web build:

```bash
pnpm build
```

Run full release checks used before shipping:

```bash
pnpm release:check
```

## Build Desktop Bundles

```bash
pnpm tauri build
```

On macOS this outputs `.app` and `.dmg` bundles under `src-tauri/target/release/bundle`.

## Data and Privacy

Kairos stores planner data locally on the device in an app-scoped SQLite database.
Attachment files are copied into the app data directory under `attachments/`.

## Project Status

Current version: 0.1.0
This is an early public release line and may change quickly.
