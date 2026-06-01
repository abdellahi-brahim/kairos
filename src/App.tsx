import { useEffect } from "react";
import { usePlanner } from "./store";
import { DayView } from "./components/DayView";
import { WeekView } from "./components/WeekView";
import { TaskDetailModal } from "./components/TaskDetailModal";

function App() {
  const refresh = usePlanner((s) => s.refresh);
  const view = usePlanner((s) => s.view);
  const detailTaskId = usePlanner((s) => s.detailTaskId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      {view === "week" ? <WeekView /> : <DayView />}
      {detailTaskId != null && (
        <TaskDetailModal key={detailTaskId} taskId={detailTaskId} />
      )}
    </>
  );
}

export default App;
