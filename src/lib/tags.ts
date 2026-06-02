// Tags are stored as a JSON array of strings in the tasks.tags column.

export function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[]): string | null {
  return tags.length ? JSON.stringify(tags) : null;
}

// A tag chip is now a single near-neutral lozenge: soft surface + muted text,
// with a tiny colored dot for at-a-glance identity. The chip itself never
// carries chroma (no more 8-color rainbow); only the small dot does, drawn from
// three low-chroma hues so the wall of chips stays calm.
export const TAG_CHIP_CLASS = "bg-soft text-muted";

// Low-chroma dot hues (hex, used as inline background on a small span). Kept
// muted on purpose so they read as quiet identity marks, not status signals.
const DOT_HUES = ["#8a9bb0", "#9aa886", "#c0937e"]; // slate, sage, clay

// Deterministic hue so a given tag always shows the same dot color.
export function tagDotColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DOT_HUES[h % DOT_HUES.length];
}
