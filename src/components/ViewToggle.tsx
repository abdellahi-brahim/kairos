import { usePlanner } from "../store";

// Day / Week segmented toggle, shown in both view headers.
export function ViewToggle() {
  const view = usePlanner((s) => s.view);
  const setView = usePlanner((s) => s.setView);

  const base =
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors";
  const active = "bg-white text-neutral-800 shadow-sm";
  const inactive = "text-neutral-500 hover:text-neutral-700";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
      <button
        onClick={() => setView("day")}
        className={base + " " + (view === "day" ? active : inactive)}
      >
        Day
      </button>
      <button
        onClick={() => setView("week")}
        className={base + " " + (view === "week" ? active : inactive)}
      >
        Week
      </button>
    </div>
  );
}
