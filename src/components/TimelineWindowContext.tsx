import { createContext, useContext } from "react";
import { defaultWindow, type TimelineWindow } from "../lib/timeline";

// The single visible-window geometry for the selected day's timeline. Computed
// once in PlannerShell (the home of the DndContext) from the day's scheduled
// tasks, and consumed by Timeline (gridlines/slots/preview), TimeBlock, and
// NowLine so every consumer shares one window. Defaults to the 06:00-22:00
// window when no provider is present.
export const TimelineWindowContext =
  createContext<TimelineWindow>(defaultWindow);

export function useTimelineWindow(): TimelineWindow {
  return useContext(TimelineWindowContext);
}
