// Tiny, defensive localStorage helpers for single-device UI preferences (panel
// widths and collapse state). These are not user DATA (that lives in SQLite);
// they are view chrome, so localStorage is the right store and a failed read or
// write must never break the app. localStorage IS available in WKWebView, but we
// wrap every access in try/catch so a private-mode quota error or a disabled
// store degrades to the default rather than throwing.

const PREFIX = "kairos.";

export function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

export function write(key: string, value: number | boolean): void {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Best-effort: ignore quota/availability errors.
  }
}
