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

## Releases

The `Release Kairos` GitHub Actions workflow is started manually and supports two channels:

- `preview` builds an Apple Silicon DMG with ad-hoc signing, creates a GitHub prerelease, and uploads `SHA256SUMS.txt`.
- `stable` builds a signed and notarized Apple Silicon DMG. It refuses to run until all Apple credentials are configured.

Stable releases require these repository secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting the `.p12`
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity
- `APPLE_ID`: Apple ID used for notarization
- `APPLE_PASSWORD`: app-specific password for that Apple ID
- `APPLE_TEAM_ID`: Apple Developer team ID

Run a preview from the GitHub Actions page with a tag such as `v0.1.0-preview.1`. Use a clean version tag such as `v0.1.0` for a stable release.

## Data and Privacy

Kairos stores planner data locally on the device in an app-scoped SQLite database.
Attachment files are copied into the app data directory under `attachments/`.

## Project Status

Current version: 0.1.0
This is an early public release line and may change quickly.
