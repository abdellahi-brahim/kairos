import { useEffect } from "react";
import { usePlanner } from "./store";
import { DayView } from "./components/DayView";
import { TaskDetailModal } from "./components/TaskDetailModal";

function App() {
  const refresh = usePlanner((s) => s.refresh);
  const detailTaskId = usePlanner((s) => s.detailTaskId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <DayView />
      {detailTaskId != null && (
        <TaskDetailModal key={detailTaskId} taskId={detailTaskId} />
      )}
    </>
  );
}

export default App;
