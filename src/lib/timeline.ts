// Timeline geometry and time helpers for the timeblocking view.

export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 22 * 60; // 22:00
export const PX_PER_MIN = 1; // 60px per hour
export const SNAP_MIN = 15;
export const DEFAULT_BLOCK_MIN = 30; // height for a task with no estimate
export const HOUR_HEIGHT = 60 * PX_PER_MIN;
export const TIMELINE_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

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
export function topForMinutes(min: number): number {
  return (min - DAY_START_MIN) * PX_PER_MIN;
}

// Keep a block of the given duration fully inside the visible day.
export function clampStart(min: number, durationMin: number): number {
  return Math.max(DAY_START_MIN, Math.min(min, DAY_END_MIN - durationMin));
}

// Hour marks for gridlines/labels, e.g. [6, 7, ... 22].
export const HOURS: number[] = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN / 60 + i,
);

// 15-minute drop targets across the day.
export function slotTimes(): string[] {
  const slots: string[] = [];
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SNAP_MIN) {
    slots.push(minutesToTime(m));
  }
  return slots;
}
