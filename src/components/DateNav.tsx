import { usePlanner } from "../store";
import { prettyDate, relativeLabel, shiftDay, todayKey } from "../lib/date";

export function DateNav() {
  const selectedDate = usePlanner((s) => s.selectedDate);
  const setDate = usePlanner((s) => s.setDate);
  const rel = relativeLabel(selectedDate);
  const isToday = selectedDate === todayKey();

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Previous day"
        onClick={() => setDate(shiftDay(selectedDate, -1))}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
      >
        ‹
      </button>

      <div className="min-w-[8.5rem] text-center leading-tight">
        <div className="font-semibold text-neutral-800">
          {rel ?? prettyDate(selectedDate)}
        </div>
        {rel && (
          <div className="text-xs text-neutral-400">{prettyDate(selectedDate)}</div>
        )}
      </div>

      <button
        aria-label="Next day"
        onClick={() => setDate(shiftDay(selectedDate, 1))}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
      >
        ›
      </button>

      {!isToday && (
        <button
          onClick={() => setDate(todayKey())}
          className="ml-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          Today
        </button>
      )}
    </div>
  );
}
