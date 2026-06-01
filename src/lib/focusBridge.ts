import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { usePlanner } from "../store";
import type { Task } from "../types";
import { todayKey } from "./date";
import { timeToMinutes } from "./timeline";

// Cross-window sync for the floating Focus widget.
//
// Two webview windows share NO JS memory. The MAIN window is the single OWNER of
// all session/pomodoro state and the ONLY writer of the DB. The widget is a thin,
// stateless subscriber: it renders what it is told ("focus-state") and sends
// control INTENTS back ("focus-intent"). The widget never mutates the store or
// the DB, so actual_minutes is never double-counted.

// Stable label for the single floating widget window.
export const FOCUS_WIDGET_LABEL = "focus-widget";

// Event names. MAIN emits focus-state and listens for focus-intent; the WIDGET
// listens for focus-state and emits focus-intent (plus focus-widget-ready on
// mount to request a fresh hydration).
export const EVT_FOCUS_STATE = "focus-state";
export const EVT_FOCUS_INTENT = "focus-intent";
export const EVT_WIDGET_READY = "focus-widget-ready";

// The full snapshot the widget needs to render. Everything is serializable; the
// widget derives the live timers itself from timerStartedAt / phaseEndsAt.
export interface FocusStatePayload {
  taskId: number | null;
  title: string | null;
  done: boolean;
  running: boolean;
  timerStartedAt: string | null;
  pomodoro: {
    active: boolean;
    phase: "work" | "break";
    phaseEndsAt: number | null;
    pausedRemainingMs: number | null;
  };
  hasPrev: boolean;
  hasNext: boolean;
}

// Control intents the widget can ask the owner to perform. The owner maps each
// to a store action (or a window operation for close-widget).
export type FocusIntent =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip" }
  | { type: "complete" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "advance" }
  | { type: "close-widget" };

// Resolve the focused task wherever it lives (day buckets, backlog, carry-over,
// or any loaded week column) so a task on a non-selected day still resolves.
// Mirrors resolveFocusTask in ZenMode / findTaskAnywhere in the store.
function resolveFocusTask(
  s: ReturnType<typeof usePlanner.getState>,
): Task | undefined {
  if (s.focusTaskId == null) return undefined;
  const direct = [...s.dayTasks, ...s.backlog, ...s.carryOver].find(
    (t) => t.id === s.focusTaskId,
  );
  if (direct) return direct;
  for (const key of Object.keys(s.weekTasks)) {
    const found = s.weekTasks[key].find((t) => t.id === s.focusTaskId);
    if (found) return found;
  }
  return undefined;
}

// Derive Prev/Next adjacency exactly the way ZenMode / buildFocusQueue does:
// today's scheduled tasks in start-time order. An unscheduled focused task has
// index -1, so Prev is off and Next jumps to the first scheduled item.
function deriveAdjacency(
  s: ReturnType<typeof usePlanner.getState>,
): { hasPrev: boolean; hasNext: boolean } {
  if (s.focusTaskId == null) return { hasPrev: false, hasNext: false };
  const today = todayKey();
  let dayList = s.weekTasks[today];
  if (dayList == null && today === s.selectedDate) dayList = s.dayTasks;
  if (dayList == null) dayList = [];
  const queue = dayList
    .filter((t) => t.scheduled_start != null)
    .sort(
      (a, b) =>
        timeToMinutes(a.scheduled_start!) - timeToMinutes(b.scheduled_start!),
    );
  const index = queue.findIndex((t) => t.id === s.focusTaskId);
  if (index === -1) return { hasPrev: false, hasNext: queue.length > 0 };
  return { hasPrev: index > 0, hasNext: index < queue.length - 1 };
}

// Build the snapshot the widget renders from the current store state.
function buildPayload(
  s: ReturnType<typeof usePlanner.getState>,
): FocusStatePayload {
  const task = resolveFocusTask(s);
  const { hasPrev, hasNext } = deriveAdjacency(s);
  return {
    taskId: s.focusTaskId,
    title: task?.title ?? null,
    done: task?.status === "done",
    running: !!task?.timer_started_at,
    timerStartedAt: task?.timer_started_at ?? null,
    pomodoro: {
      active: s.pomodoro.active,
      phase: s.pomodoro.phase,
      phaseEndsAt: s.pomodoro.phaseEndsAt,
      pausedRemainingMs: s.pomodoro.pausedRemainingMs,
    },
    hasPrev,
    hasNext,
  };
}

// Cheap structural diff so we only emit when something the widget cares about
// actually changed (the store fires on every keystroke elsewhere in the app).
function payloadsEqual(a: FocusStatePayload, b: FocusStatePayload): boolean {
  return (
    a.taskId === b.taskId &&
    a.title === b.title &&
    a.done === b.done &&
    a.running === b.running &&
    a.timerStartedAt === b.timerStartedAt &&
    a.hasPrev === b.hasPrev &&
    a.hasNext === b.hasNext &&
    a.pomodoro.active === b.pomodoro.active &&
    a.pomodoro.phase === b.pomodoro.phase &&
    a.pomodoro.phaseEndsAt === b.pomodoro.phaseEndsAt &&
    a.pomodoro.pausedRemainingMs === b.pomodoro.pausedRemainingMs
  );
}

// Open (or focus) the floating widget window. Called from the MAIN window only
// (e.g. the Zen "Pop out" button). If a widget already exists we reuse/focus it
// instead of creating a second one.
export async function openFocusWidget(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(FOCUS_WIDGET_LABEL);
  if (existing) {
    try {
      await existing.show();
      await existing.setFocus();
    } catch (err) {
      console.error("Focus widget reuse failed", err);
    }
    return;
  }
  // Pin the badge to the TOP-RIGHT of the primary screen, just under the menu
  // bar. Monitor size/position are physical px; divide by scaleFactor for the
  // logical coords the window options expect. Fall back to a sane default if the
  // monitor query fails.
  const WIDGET_W = 300;
  const INSET = 16;
  let x = 16;
  const y = 44;
  try {
    const mon = await primaryMonitor();
    if (mon) {
      const scale = mon.scaleFactor || 1;
      const logicalRight = mon.position.x / scale + mon.size.width / scale;
      x = Math.round(logicalRight - WIDGET_W - INSET);
    }
  } catch (err) {
    console.error("primaryMonitor failed; defaulting widget position", err);
  }
  const win = new WebviewWindow(FOCUS_WIDGET_LABEL, {
    url: "/",
    title: "Focus",
    // The window is intentionally a bit LARGER than the visible badge card. The
    // card leaves a transparent margin inside the window so its CSS drop-shadow
    // and rounded corners are not clipped by the window edge. We disable the
    // native window shadow (it would draw a hard rectangle behind the round
    // card) and draw our own soft shadow in CSS so it follows the corners.
    width: WIDGET_W,
    height: 132,
    x,
    y,
    transparent: true,
    shadow: false,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
  });
  win.once("tauri://created", () => {
    // macOS: keep the widget visible across Cmd-Tab and Space switches (the
    // whole point of the floating widget). Best-effort.
    void win.setVisibleOnAllWorkspaces(true).catch((err) => {
      console.error("setVisibleOnAllWorkspaces failed", err);
    });
  });
  win.once("tauri://error", (e) => {
    console.error("Focus widget creation failed", e);
  });
}

// MAIN side of the bridge. Call exactly once from App, and ONLY when running in
// the main window. Returns a cleanup function (unsubscribes everything).
export function initFocusBridgeMain(): () => void {
  let lastPayload: FocusStatePayload | null = null;

  const emitState = (force = false) => {
    const payload = buildPayload(usePlanner.getState());
    if (!force && lastPayload && payloadsEqual(lastPayload, payload)) return;
    lastPayload = payload;
    void emit(EVT_FOCUS_STATE, payload);
  };

  // Re-emit whenever the focus/pomodoro-relevant slice could have changed. The
  // diff above suppresses no-op emits, so subscribing to every store change is
  // fine and keeps the resolution logic in one place.
  const unsubStore = usePlanner.subscribe(() => emitState());

  // When focusTaskId goes null (focus ended), close the widget if it is open.
  let prevFocusId = usePlanner.getState().focusTaskId;
  const unsubFocusEnd = usePlanner.subscribe((state) => {
    const id = state.focusTaskId;
    if (prevFocusId != null && id == null) {
      void WebviewWindow.getByLabel(FOCUS_WIDGET_LABEL).then((w) => {
        if (w) void w.close().catch(() => {});
      });
    }
    prevFocusId = id;
  });

  // The widget asks for a fresh snapshot on mount (it has no state of its own).
  const readyUnlistenP = listen(EVT_WIDGET_READY, () => emitState(true));

  // Map control intents to owner actions. Only the main window executes these.
  const intentUnlistenP = listen<FocusIntent>(EVT_FOCUS_INTENT, (e) => {
    const s = usePlanner.getState();
    switch (e.payload.type) {
      case "pause":
        void s.pausePomodoro();
        break;
      case "resume":
        void s.resumePomodoro();
        break;
      case "skip":
        void s.skipPhase();
        break;
      case "complete":
        void s.completeFocus();
        break;
      case "next":
        void s.focusNext();
        break;
      case "prev":
        void s.focusPrev();
        break;
      case "advance":
        void s.advancePomodoroIfDue();
        break;
      case "close-widget":
        void WebviewWindow.getByLabel(FOCUS_WIDGET_LABEL).then((w) => {
          if (w) void w.close().catch(() => {});
        });
        break;
    }
  });

  return () => {
    unsubStore();
    unsubFocusEnd();
    void readyUnlistenP.then((un) => un());
    void intentUnlistenP.then((un) => un());
  };
}

// WIDGET side helpers. The widget emits intents back to the owner; we target the
// main window explicitly so the intent is not also received by the widget.
export function sendIntent(intent: FocusIntent): void {
  void emitTo("main", EVT_FOCUS_INTENT, intent);
}

// Tell the owner we just mounted so it sends a fresh focus-state to hydrate us.
export function announceWidgetReady(): void {
  void emitTo("main", EVT_WIDGET_READY, {});
}

// Subscribe to focus-state. Returns a promise resolving to an unlisten fn.
export function listenFocusState(
  cb: (payload: FocusStatePayload) => void,
): Promise<() => void> {
  return listen<FocusStatePayload>(EVT_FOCUS_STATE, (e) => cb(e.payload));
}

// Close this (widget) window from inside it (the ✕ button fallback).
export async function closeSelf(): Promise<void> {
  try {
    await getCurrentWindow().close();
  } catch (err) {
    console.error("Widget self-close failed", err);
  }
}
