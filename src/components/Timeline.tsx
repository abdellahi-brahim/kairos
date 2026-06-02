import { useDroppable } from "@dnd-kit/core";
import { usePlanner } from "../store";
import { todayKey } from "../lib/date";
import { TimeBlock } from "./TimeBlock";
import { NowLine } from "./NowLine";
import {
  PX_PER_MIN,
  SNAP_MIN,
  hoursFor,
  slotTimesFor,
  timeToMinutes,
  timelineHeight,
  topForMinutes,
  type TimelineWindow,
} from "../lib/timeline";
import { useTimelineWindow } from "./TimelineWindowContext";

export interface DropPreview {
  time: string;
  durationMin: number;
}

function Slot({ time, win }: { time: string; win: TimelineWindow }) {
  const { setNodeRef } = useDroppable({
    id: `slot-${time}`,
    data: { type: "slot", time },
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        top: topForMinutes(timeToMinutes(time), win),
        height: SNAP_MIN * PX_PER_MIN,
      }}
      className="absolute left-14 right-2"
    />
  );
}

export function Timeline({ preview }: { preview: DropPreview | null }) {
  const dayTasks = usePlanner((s) => s.dayTasks);
  const selectedDate = usePlanner((s) => s.selectedDate);
  const win = useTimelineWindow();
  const scheduled = dayTasks.filter((t) => t.scheduled_start);

  return (
    <div className="relative" style={{ height: timelineHeight(win) }}>
      {/* Hour gridlines + labels */}
      {hoursFor(win).map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-soft"
          style={{ top: topForMinutes(h * 60, win) }}
        >
          <span className="absolute -top-2 left-0 w-12 pr-2 text-right text-[10px] tabular-nums text-muted">
            {String(h).padStart(2, "0")}:00
          </span>
        </div>
      ))}

      {/* 15-minute drop targets (invisible; preview is drawn separately) */}
      {slotTimesFor(win).map((t) => (
        <Slot key={t} time={t} win={win} />
      ))}

      {/* Ghost preview of where the dragged task will land, at full height */}
      {preview && (
        <div
          className="pointer-events-none absolute left-14 right-2 z-0 rounded-md border-2 border-dashed border-accent/50 bg-accent-soft/60"
          style={{
            top: topForMinutes(timeToMinutes(preview.time), win),
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
