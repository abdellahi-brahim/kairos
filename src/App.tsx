import { useEffect } from "react";
import { usePlanner } from "./store";
import { PlannerShell } from "./components/PlannerShell";
import { TaskDetailModal } from "./components/TaskDetailModal";

function App() {
  const refresh = usePlanner((s) => s.refresh);
  const detailTaskId = usePlanner((s) => s.detailTaskId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <PlannerShell />
      {detailTaskId != null && (
        <TaskDetailModal key={detailTaskId} taskId={detailTaskId} />
      )}
    </>
  );
}

export default App;
