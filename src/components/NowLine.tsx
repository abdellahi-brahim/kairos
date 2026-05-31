import { useEffect, useState } from "react";
import { DAY_END_MIN, DAY_START_MIN, topForMinutes } from "../lib/timeline";

// A horizontal marker at the current time of day, refreshed each minute.
export function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < DAY_START_MIN || minutes > DAY_END_MIN) return null;

  return (
    <div
      className="pointer-events-none absolute left-12 right-2 z-20 flex items-center"
      style={{ top: topForMinutes(minutes) }}
    >
      <div className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}
