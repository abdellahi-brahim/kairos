import { createContext, useContext } from "react";

// Ephemeral marker for a within-column reorder drag: which row the insertion line
// sits on, and which edge ("above" / "below"). Created in PlannerShell (the home
// of the single DndContext) from onDragOver, and consumed by TaskItem to draw a
// 2px indigo insertion line at the exact drop point. Null whenever no within-
// column reorder is in progress (cross-column moves use the zone highlight only).
export interface Insertion {
  taskId: number;
  edge: "above" | "below";
}

export const InsertionContext = createContext<Insertion | null>(null);

export function useInsertion(): Insertion | null {
  return useContext(InsertionContext);
}
