import { useDroppable } from "@dnd-kit/core";
import { usePlanner } from "../store";
import { todayKey } from "../lib/date";
import { TimeBlock } from "./TimeBlock";
import { NowLine } from "./NowLine";
import {
  HOURS,
  PX_PER_MIN,
  SNAP_MIN,
  TIMELINE_HEIGHT,
  slotTimes,
  timeToMinutes,
  topForMinutes,
} from "../lib/timeline";

export interface DropPreview {
  time: string;
  durationMin: number;
}

function Slot({ time }: { time: string }) {
  const { setNodeRef } = useDroppable({
    id: `slot-${time}`,
    data: { type: "slot", time },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        top: topForMinutes(timeToMinutes(time)),
        height: SNAP_MIN * PX_PER_MIN,
      }}
      className="absolute left-14 right-2"
    />
  );
}

export function Timeline({ preview }: { preview: DropPreview | null }) {
  const dayTasks = usePlanner((s) => s.dayTasks);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const scheduled = dayTasks.filter((t) => t.scheduled_start);

  return (
    <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
      {/* Hour gridlines + labels */}
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-neutral-100"
          style={{ top: topForMinutes(h * 60) }}
        >
          <span className="absolute -top-2 left-0 w-12 pr-2 text-right text-[10px] tabular-nums text-neutral-400">
            {String(h).padStart(2, "0")}:00
          </span>
        </div>
      ))}

      {/* 15-minute drop targets (invisible; preview is drawn separately) */}
      {slotTimes().map((t) => (
        <Slot key={t} time={t} />
      ))}

      {/* Ghost preview of where the dragged task will land, at full height */}
      {preview && (
        <div
          className="pointer-events-none absolute left-14 right-2 z-0 rounded-md border-2 border-dashed border-indigo-300 bg-indigo-100/50"
          style={{
            top: topForMinutes(timeToMinutes(preview.time)),
            height: preview.durationMin * PX_PER_MIN,
          }}
        />
      )}

      {/* Scheduled task blocks */}
      {scheduled.map((task) => (
        <TimeBlock key={task.id} task={task} />
      ))}

      {/* Current-time marker (only when viewing today) */}
      {selectedDate === todayKey() && <NowLine />}
    </div>
  );
}
