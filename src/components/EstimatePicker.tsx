import { useState } from "react";
import { formatDuration } from "../lib/date";

const PRESETS = [15, 30, 45, 60, 90, 120];

interface EstimatePickerProps {
  value: number | null;
  onChange: (minutes: number | null) => void;
}

export function EstimatePicker({ value, onChange }: EstimatePickerProps) {
  const [open, setOpen] = useState(false);

  const pick = (minutes: number | null) => {
    onChange(minutes);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          value != null
            ? "rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
            : "rounded-md px-1.5 py-0.5 text-xs text-neutral-400 opacity-0 hover:bg-neutral-100 group-hover:opacity-100"
        }
      >
        {value != null ? formatDuration(value) : "+ est"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border border-neutral-200 bg-white p-1 shadow-lg">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => pick(m)}
                className="block w-full rounded px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-100"
              >
                {formatDuration(m)}
              </button>
            ))}
            {value != null && (
              <button
                onClick={() => pick(null)}
                className="mt-1 block w-full rounded border-t border-neutral-100 px-2 py-1 text-left text-xs text-neutral-400 hover:bg-neutral-100"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
