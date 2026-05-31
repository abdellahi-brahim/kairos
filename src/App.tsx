import { useEffect } from "react";
import { usePlanner } from "./store";
import { DayView } from "./components/DayView";

function App() {
  const refresh = usePlanner((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <DayView />;
}

export default App;
