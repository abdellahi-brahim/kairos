import { useEffect } from "react";
import { usePlanner } from "./store";
import { PlannerShell } from "./components/PlannerShell";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { ZenMode } from "./components/ZenMode";

function App() {
  const refresh = usePlanner((s) => s.refresh);
  const detailTaskId = usePlanner((s) => s.detailTaskId);
  const focusTaskId = usePlanner((s) => s.focusTaskId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <PlannerShell />
      {detailTaskId != null && (
        <TaskDetailModal key={detailTaskId} taskId={detailTaskId} />
      )}
      {focusTaskId != null && <ZenMode key={focusTaskId} />}
    </>
  );
}

export default App;
