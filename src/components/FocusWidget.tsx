import { useEffect, useState } from "react";
import {
  announceWidgetReady,
  closeSelf,
  listenFocusState,
  sendIntent,
  type FocusStatePayload,
} from "../lib/focusBridge";

const pad = (n: number) => String(n).padStart(2, "0");

// The small, always-on-top floating widget. It is a PURE subscriber: no store,
// no SQL, no zustand. It renders the focus-state pushed by the main window and
// emits intents for its buttons. Its own 1s tick drives the live timer display
// and a robustness "advance" nudge so pomodoro phases still flip even when the
// main window's tick is throttled in the background.
export function FocusWidget() {
  const [state, setState] = useState<FocusStatePayload | null>(null);
  const [, setTick] = useState(0);

  // Subscribe to focus-state and ask the owner for a fresh snapshot on mount.
  useEffect(() => {
    const unlistenP = listenFocusState((payload) => setState(payload));
    announceWidgetReady();
    return () => {
      void unlistenP.then((un) => un());
    };
  }, []);

  // 1s tick: re-render the live timers AND nudge the owner to advance the
  // pomodoro phase if its deadline has passed (advancePomodoroIfDue is
  // idempotent, so the owner's own tick + this nudge are safe together).
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      const p = state?.pomodoro;
      if (
        p &&
        p.active &&
        p.pausedRemainingMs == null &&
        p.phaseEndsAt != null &&
        Date.now() >= p.phaseEndsAt
      ) {
        sendIntent({ type: "advance" });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const hasTask = state != null && state.taskId != null;
  const pomo = state?.pomodoro;
  const pomoActive = !!pomo?.active;
  const pomoPaused = pomo?.pausedRemainingMs != null;
  const pomoIsWork = pomo?.phase === "work";

  // Primary timer line. Pomodoro countdown when active; otherwise the plain
  // session elapsed (mm:ss) from timerStartedAt.
  let timerLabel = "";
  let timerClass = "text-neutral-300";
  if (hasTask && pomoActive && pomo) {
    const remainMs = pomoPaused
      ? pomo.pausedRemainingMs ?? 0
      : Math.max(0, (pomo.phaseEndsAt ?? Date.now()) - Date.now());
    const totalSec = Math.ceil(remainMs / 1000);
    const clock = `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
    timerLabel = `${pomoIsWork ? "Focus" : "Break"} ${clock}`;
    timerClass = pomoIsWork ? "text-indigo-300" : "text-emerald-300";
  } else if (hasTask && state?.running && state.timerStartedAt) {
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - new Date(state.timerStartedAt).getTime()) / 1000),
    );
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const sec = elapsedSec % 60;
    timerLabel =
      h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    timerClass = "text-emerald-300";
  }

  const btnBase =
    "rounded px-2 py-1 text-[12px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100";

  return (
    // The whole card is a drag region so the frameless window can be moved.
    // Buttons opt OUT (they are not drag regions) so they stay clickable, the
    // same rule the titlebar work uses.
    <div
      data-tauri-drag-region
      className="flex h-screen w-screen flex-col justify-between bg-neutral-900 px-3 py-2.5 text-neutral-100 select-none"
    >
      {/* Top row: title + close. */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={
            "truncate text-[13px] font-medium " +
            (hasTask
              ? state?.done
                ? "text-neutral-500 line-through"
                : "text-neutral-100"
              : "text-neutral-500")
          }
        >
          {hasTask ? state?.title : "No active focus"}
        </span>
        <button
          onClick={() => void closeSelf()}
          className="-mr-1 shrink-0 rounded px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          aria-label="Close widget"
        >
          ✕
        </button>
      </div>

      {/* Primary timer. */}
      <div
        className={"text-[22px] font-semibold tabular-nums " + timerClass}
      >
        {hasTask ? timerLabel || "--:--" : "--:--"}
        {pomoActive && pomoPaused && (
          <span className="ml-2 align-middle text-[11px] font-normal text-neutral-500">
            paused
          </span>
        )}
      </div>

      {/* Controls. Pomodoro Pause/Resume + Skip when active; always Complete
          (primary) + Next; intents only, never local state. */}
      <div className="flex items-center gap-1">
        {pomoActive && (
          <>
            <button
              onClick={() =>
                sendIntent({ type: pomoPaused ? "resume" : "pause" })
              }
              disabled={!hasTask}
              className={btnBase}
            >
              {pomoPaused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => sendIntent({ type: "skip" })}
              disabled={!hasTask}
              className={btnBase}
            >
              Skip
            </button>
          </>
        )}
        <button
          onClick={() => sendIntent({ type: "complete" })}
          disabled={!hasTask}
          className="rounded bg-indigo-500 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
        >
          Complete
        </button>
        <button
          onClick={() => sendIntent({ type: "next" })}
          disabled={!hasTask || !state?.hasNext}
          className={
            "ml-auto rounded px-2 py-1 text-[12px] " +
            (hasTask && state?.hasNext
              ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              : "cursor-default text-neutral-700")
          }
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
