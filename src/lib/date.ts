import { addDays, format, parseISO } from "date-fns";

// All day "keys" are "yyyy-MM-dd" strings, used both as DB values and as the
// app's notion of "which day am I planning".

export function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function shiftDay(key: string, days: number): string {
  return format(addDays(parseISO(key), days), "yyyy-MM-dd");
}

export function prettyDate(key: string): string {
  return format(parseISO(key), "EEE, MMM d");
}

export function relativeLabel(key: string): string | null {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === shiftDay(today, 1)) return "Tomorrow";
  if (key === shiftDay(today, -1)) return "Yesterday";
  return null;
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "MMM d, h:mm a");
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
