import { PRIORITIES } from "../lib/priority";

interface PriorityPickerProps {
  value: number;
  onChange: (value: number) => void;
}

// Segmented control: None / Low / Med / High.
export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="flex gap-0.5 rounded-md bg-soft p-0.5">
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] " +
            (value === p.value
              ? "bg-surface-raised font-medium text-text shadow-sm"
              : "text-muted hover:text-text")
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
