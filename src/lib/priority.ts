export interface PriorityMeta {
  value: number;
  label: string;
  dot: string; // classes for the flag/dot (priority picker, detail modal)
  // Left-edge color-rail class for a task card (border-l color). Empty for
  // "None" so a card with no priority shows no rail.
  rail: string;
}

// A single restrained ramp instead of a sky/amber/red traffic light:
//   None -> no mark, no rail
//   Low  -> a hollow muted dot (ring only), no rail
//   Med  -> a filled accent dot + accent rail
//   High -> the one alert color (filled dot + alert rail)
// The dot classes are full Tailwind class strings so the picker/modal can drop
// them straight onto a span. Low is "hollow" via ring utilities.
export const PRIORITIES: PriorityMeta[] = [
  { value: 0, label: "None", dot: "bg-faint", rail: "" },
  {
    value: 1,
    label: "Low",
    dot: "bg-transparent ring-1 ring-inset ring-muted",
    rail: "",
  },
  { value: 2, label: "Med", dot: "bg-accent", rail: "border-l-accent" },
  { value: 3, label: "High", dot: "bg-alert", rail: "border-l-alert" },
];

export function priorityMeta(value: number): PriorityMeta {
  return PRIORITIES[value] ?? PRIORITIES[0];
}
