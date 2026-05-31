import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "../types";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  bucket: "day" | "backlog";
  tasks: Task[];
  emptyText: string;
}

// Reordering and drag-to-schedule are driven by the shared DndContext in
// PlannerBoard. The wrapping div is a droppable so a task can be dragged from
// another bucket onto this list (including when the list is empty).
export function TaskList({ bucket, tasks, emptyText }: TaskListProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `list-${bucket}`,
    data: { type: "list", bucket },
  });

  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[2.5rem] rounded-lg " +
        (isOver ? "bg-indigo-50/60 ring-1 ring-indigo-200" : "")
      }
    >
      {tasks.length === 0 ? (
        <p className="px-2 py-3 text-sm text-neutral-400">{emptyText}</p>
      ) : (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-0.5">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} bucket={bucket} />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}
