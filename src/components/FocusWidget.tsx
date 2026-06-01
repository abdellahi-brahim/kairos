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
//
// Visually it is a glassy rounded HUD badge floating in the top-left of the
// screen. The native window is transparent and larger than the card, so the
// card's CSS shadow and rounded corners render in the surrounding margin.
export function FocusWidget() {
  const [state, setState] = useState<FocusStatePayload | null>(null);
  const [, setTick] = useState(0);
  // Hover-reveal for the secondary controls (Pause/Resume, Skip, Next, close).
  // Driven by JS state, not CSS :hover, because WKWebView can leave a CSS hover
  // stuck after a drag (the same rule the rest of the app follows).
  const [hovered, setHovered] = useState(false);

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
  // session elapsed (mm:ss) from timerStartedAt. We split the phase LABEL from
  // the CLOCK so the clock can be the large tabular-nums focal point and the
  // label a tiny caption above it.
  let phaseLabel = "";
  let timerClock = "";
  let clockClass = "text-neutral-300";
  if (hasTask && pomoActive && pomo) {
    const remainMs = pomoPaused
      ? pomo.pausedRemainingMs ?? 0
      : Math.max(0, (pomo.phaseEndsAt ?? Date.now()) - Date.now());
    const totalSec = Math.ceil(remainMs / 1000);
    timerClock = `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
    phaseLabel = pomoIsWork ? "Focus" : "Break";
    clockClass = pomoIsWork ? "text-indigo-200" : "text-emerald-200";
  } else if (hasTask && state?.running && state.timerStartedAt) {
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - new Date(state.timerStartedAt).getTime()) / 1000),
    );
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const sec = elapsedSec % 60;
    timerClock =
      h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    phaseLabel = "Session";
    clockClass = "text-emerald-200";
  }

  // Status dot color: indigo while working, emerald on break, neutral idle.
  const dotClass = !hasTask
    ? "bg-neutral-600"
    : pomoActive
      ? pomoIsWork
        ? "bg-indigo-400"
        : "bg-emerald-400"
      : "bg-emerald-400";

  // Quiet icon button. Controls explicitly opt OUT of the drag region so clicks
  // land instead of starting a window drag.
  const iconBtn =
    "rounded-md p-1 text-neutral-400 transition hover:bg-white/10 hover:text-neutral-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400";

  // Secondary controls fade/scale in on hover; they stay mounted (and clickable)
  // but are pointer-events-none + invisible when resting so the badge is calm.
  const revealClass = hovered
    ? "opacity-100"
    : "pointer-events-none opacity-0";

  return (
    // Transparent window: pad it so the card sits inset and its shadow renders.
    <div className="flex h-screen w-screen items-stretch p-2.5 select-none">
      {/* The badge card. The body is the drag region; interactive controls below
          opt out so they remain clickable. */}
      <div
        data-tauri-drag-region
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex w-full flex-col justify-between rounded-2xl border border-white/10 bg-neutral-900/85 px-3.5 py-2.5 text-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        {/* Top line: status dot + task title (truncated) + close on hover. */}
        <div
          data-tauri-drag-region
          className="flex items-center gap-2"
        >
          <span
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              dotClass +
              (hasTask && pomoActive ? " shadow-[0_0_6px_currentColor]" : "")
            }
            aria-hidden
          />
          <span
            data-tauri-drag-region
            className={
              "min-w-0 flex-1 truncate text-[12.5px] font-medium " +
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
            className={
              "shrink-0 rounded-md p-0.5 text-neutral-500 transition hover:bg-white/10 hover:text-neutral-200 " +
              revealClass
            }
            aria-label="Close widget"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Hero: the timer. Tiny phase caption above the large clock. */}
        <div data-tauri-drag-region className="flex items-end justify-between">
          <div data-tauri-drag-region className="min-w-0">
            {hasTask && phaseLabel && (
              <div
                className={
                  "text-[10px] font-medium tracking-wide uppercase " +
                  (pomoActive
                    ? pomoIsWork
                      ? "text-indigo-400/80"
                      : "text-emerald-400/80"
                    : "text-emerald-400/70")
                }
              >
                {phaseLabel}
                {pomoActive && pomoPaused && (
                  <span className="ml-1.5 text-neutral-500 normal-case">
                    paused
                  </span>
                )}
              </div>
            )}
            <div
              className={
                "text-[26px] leading-none font-semibold tabular-nums " +
                (hasTask ? clockClass : "text-neutral-600")
              }
            >
              {hasTask ? timerClock || "--:--" : "--:--"}
            </div>
          </div>

          {/* Complete is the primary action and stays visible (when a task is
              focused) so the badge always offers its main affordance. */}
          {hasTask && (
            <button
              onClick={() => sendIntent({ type: "complete" })}
              className="shrink-0 rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-400"
            >
              Done
            </button>
          )}
        </div>

        {/* Secondary controls: hover-revealed, quiet icon buttons. */}
        <div
          className={
            "flex items-center gap-0.5 transition-opacity duration-150 " +
            revealClass
          }
        >
          {pomoActive && (
            <>
              <button
                onClick={() =>
                  sendIntent({ type: pomoPaused ? "resume" : "pause" })
                }
                disabled={!hasTask}
                className={iconBtn}
                aria-label={pomoPaused ? "Resume" : "Pause"}
                title={pomoPaused ? "Resume" : "Pause"}
              >
                {pomoPaused ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button
                onClick={() => sendIntent({ type: "skip" })}
                disabled={!hasTask}
                className={iconBtn}
                aria-label="Skip phase"
                title="Skip phase"
              >
                <SkipIcon />
              </button>
            </>
          )}
          <button
            onClick={() => sendIntent({ type: "next" })}
            disabled={!hasTask || !state?.hasNext}
            className={iconBtn + " ml-auto"}
            aria-label="Next task"
            title="Next task"
          >
            <NextIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// Tiny, refined inline icons (1.5px stroke) so the controls read as a HUD.
function iconProps() {
  return {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function PlayIcon() {
  return (
    <svg {...iconProps()}>
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg {...iconProps()}>
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg {...iconProps()}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...iconProps()}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
