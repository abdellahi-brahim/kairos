export interface PriorityMeta {
  value: number;
  label: string;
  dot: string; // bg color class for the flag/dot
  chip: string; // classes for a small chip
}

export const PRIORITIES: PriorityMeta[] = [
  { value: 0, label: "None", dot: "bg-neutral-300", chip: "text-neutral-400" },
  { value: 1, label: "Low", dot: "bg-sky-400", chip: "bg-sky-50 text-sky-600" },
  { value: 2, label: "Med", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-600" },
  { value: 3, label: "High", dot: "bg-red-500", chip: "bg-red-50 text-red-600" },
];

export function priorityMeta(value: number): PriorityMeta {
  return PRIORITIES[value] ?? PRIORITIES[0];
}
