# Kairos

Kairos is a local-first daily planner for turning tasks into time blocks and focused work. It is built with Tauri, React, TypeScript, and SQLite.

<p align="center">
	<img
		src="docs/media/kairos-week-view.png"
		alt="Kairos Week view with an inbox, day columns, and a daily timeline"
		width="100%"
	/>
</p>

## See Kairos in Action

<table>
	<tr>
		<td width="50%" valign="top">
			<strong>Turn tasks into a daily plan</strong><br />
			Expand one day and place work directly on the timeline.
			<br /><br />
			<img
				src="docs/media/kairos-day-view.png"
				alt="Kairos Day view with scheduled time blocks"
				width="100%"
			/>
		</td>
		<td width="50%" valign="top">
			<strong>Keep the context with the task</strong><br />
			Notes, subtasks, comments, tags, estimates, and tracked time stay together.
			<br /><br />
			<img
				src="docs/media/kairos-task-detail.png"
				alt="Kairos task detail with notes, subtasks, comments, and metadata"
				width="100%"
			/>
		</td>
	</tr>
</table>

### Focus on One Thing

Focus mode clears away the planner while keeping the task, its next steps, and the timer in view.

<p align="center">
	<img
		src="docs/media/kairos-focus-mode.png"
		alt="Kairos Focus mode with a single task and Pomodoro controls"
		width="100%"
	/>
</p>

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

## Download

Kairos currently ships as an Apple Silicon preview for macOS. Download the DMG and its SHA-256 checksum from [GitHub Releases](https://github.com/abdellahi-brahim/kairos/releases).

The preview is not notarized, so macOS may block its first launch. After copying Kairos to Applications, right-click the app and choose **Open**. A signed and notarized stable release will follow.

Release instructions for maintainers live in [`.github/RELEASING.md`](.github/RELEASING.md).

## Data and Privacy

Kairos stores planner data locally on the device in an app-scoped SQLite database.
Attachment files are copied into the app data directory under `attachments/`.

## Project Status

Current version: 0.1.0
This is an early public release line and may change quickly.
