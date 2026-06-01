// Timeline geometry and time helpers for the timeblocking view.

import type { Task } from "../types";

// Default visible window. The rendered window auto-expands outward (see
// computeWindow) when the selected day has a block outside this range, but never
// shrinks below it.
export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 22 * 60; // 22:00
export const PX_PER_MIN = 1; // 60px per hour
export const SNAP_MIN = 15;
export const DEFAULT_BLOCK_MIN = 30; // height for a task with no estimate
export const HOUR_HEIGHT = 60 * PX_PER_MIN;

// The visible vertical span of the timeline, in minutes-of-day. A single window
// is computed once per selected day and threaded to every consumer (gridlines,
// slots, preview, blocks, now-line, drop math) so they all share one geometry.
export interface TimelineWindow {
  startMin: number;
  endMin: number;
}

export const defaultWindow: TimelineWindow = {
  startMin: DAY_START_MIN,
  endMin: DAY_END_MIN,
};

const DAY_MIN = 24 * 60;

// Grow the default window outward (rounded to whole hours) to enclose every
// scheduled block on the day. With no scheduled tasks, or all inside the
// default, this returns exactly the default window so behavior is unchanged.
export function computeWindow(tasks: Task[]): TimelineWindow {
  let startMin = DAY_START_MIN;
  let endMin = DAY_END_MIN;
  for (const task of tasks) {
    if (task.scheduled_start == null) continue;
    const start = timeToMinutes(task.scheduled_start);
    const end = start + (task.estimate_minutes ?? DEFAULT_BLOCK_MIN);
    startMin = Math.min(startMin, Math.floor(start / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(end / 60) * 60);
  }
  return {
    startMin: Math.max(0, startMin),
    endMin: Math.min(DAY_MIN, endMin),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

// Vertical offset (px) from the top of the timeline for a given minute-of-day.
export function topForMinutes(min: number, win: TimelineWindow): number {
  return (min - win.startMin) * PX_PER_MIN;
}

// Keep a block of the given duration fully inside the visible window.
export function clampStart(
  min: number,
  durationMin: number,
  win: TimelineWindow,
): number {
  return Math.max(win.startMin, Math.min(min, win.endMin - durationMin));
}

// The visible vertical span of the timeline in pixels for the given window.
export function timelineHeight(win: TimelineWindow): number {
  return (win.endMin - win.startMin) * PX_PER_MIN;
}

// Hour marks for gridlines/labels, e.g. [6, 7, ... 22].
export function hoursFor(win: TimelineWindow): number[] {
  const first = win.startMin / 60;
  const count = (win.endMin - win.startMin) / 60 + 1;
  return Array.from({ length: count }, (_, i) => first + i);
}

// 15-minute drop targets across the window.
export function slotTimesFor(win: TimelineWindow): string[] {
  const slots: string[] = [];
  for (let m = win.startMin; m < win.endMin; m += SNAP_MIN) {
    slots.push(minutesToTime(m));
  }
  return slots;
}
