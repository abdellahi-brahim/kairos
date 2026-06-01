import { PRIORITIES } from "../lib/priority";

interface PriorityPickerProps {
  value: number;
  onChange: (value: number) => void;
}

// Segmented control: None / Low / Med / High.
export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="flex gap-0.5 rounded-md bg-neutral-100 p-0.5">
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] " +
            (value === p.value
              ? "bg-white font-medium text-neutral-800 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700")
          }
        >
          {p.value > 0 && (
            <span className={"h-1.5 w-1.5 rounded-full " + p.dot} />
          )}
          {p.label}
        </button>
      ))}
    </div>
  );
}
