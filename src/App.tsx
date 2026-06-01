import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePlanner } from "./store";
import { PlannerShell } from "./components/PlannerShell";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { ZenMode } from "./components/ZenMode";
import { initFocusBridgeMain } from "./lib/focusBridge";

function App() {
  const refresh = usePlanner((s) => s.refresh);
  const detailTaskId = usePlanner((s) => s.detailTaskId);
  const focusTaskId = usePlanner((s) => s.focusTaskId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Start the main side of the focus bridge (owner of state, writer of the DB,
  // emitter of focus-state, executor of intents). Guard on the window label so
  // the bridge only ever runs in the main window, even though both windows share
  // this bundle.
  useEffect(() => {
    if (getCurrentWindow().label !== "main") return;
    const cleanup = initFocusBridgeMain();
    return cleanup;
  }, []);

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
