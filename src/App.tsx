import { useEffect, useState } from "react";
import { getDb } from "./db";

function App() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ count: number }[]>(
          "SELECT COUNT(*) as count FROM tasks",
        );
        setTaskCount(rows[0]?.count ?? 0);
        setStatus("ok");
      } catch (e) {
        setError(String(e));
        setStatus("error");
      }
    })();
  }, []);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50 text-neutral-800">
      <h1 className="text-2xl font-semibold">Daily Planner</h1>
      {status === "loading" && (
        <p className="text-neutral-500">Connecting to database…</p>
      )}
      {status === "ok" && (
        <p className="rounded-md bg-green-100 px-3 py-1 text-green-800">
          Foundation OK — tasks table reachable ({taskCount} tasks)
        </p>
      )}
      {status === "error" && (
        <p className="max-w-md rounded-md bg-red-100 px-3 py-1 text-red-800">
          DB error: {error}
        </p>
      )}
    </main>
  );
}

export default App;
