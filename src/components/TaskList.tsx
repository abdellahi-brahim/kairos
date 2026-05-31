import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "../types";
import { usePlanner } from "../store";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  bucket: "day" | "backlog";
  tasks: Task[];
  emptyText: string;
}

export function TaskList({ bucket, tasks, emptyText }: TaskListProps) {
  const reorder = usePlanner((s) => s.reorder);

  // A small drag threshold so clicks on the handle still register as clicks
  // elsewhere in the row (checkbox, title, buttons).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    reorder(bucket, arrayMove(ids, from, to));
  };

  if (tasks.length === 0) {
    return <p className="px-2 py-3 text-sm text-neutral-400">{emptyText}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-0.5">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
