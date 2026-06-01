export interface PriorityMeta {
  value: number;
  label: string;
  dot: string; // bg color class for the flag/dot (priority picker, detail modal)
  chip: string; // classes for a small chip
  // Left-edge color-rail class for a task card (border-l color). Empty for
  // "None" so a card with no priority keeps its plain hairline border.
  rail: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { value: 0, label: "None", dot: "bg-neutral-300", chip: "text-neutral-400", rail: "" },
  { value: 1, label: "Low", dot: "bg-sky-400", chip: "bg-sky-50 text-sky-600", rail: "border-l-sky-400" },
  { value: 2, label: "Med", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-600", rail: "border-l-amber-400" },
  { value: 3, label: "High", dot: "bg-red-500", chip: "bg-red-50 text-red-600", rail: "border-l-red-500" },
];

export function priorityMeta(value: number): PriorityMeta {
  return PRIORITIES[value] ?? PRIORITIES[0];
}
