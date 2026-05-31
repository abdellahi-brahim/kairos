// Global drag-cursor manager for WKWebView (Safari/WebKit).
//
// WebKit will not repaint an element's CSS `cursor` mid-press: once the pointer
// is down, whatever cursor was showing at press time is held until release. So
// toggling a class on the dragged element (e.g. cursor-grab -> cursor-grabbing)
// does nothing during a drag. The robust workaround used by
// react-resizable-panels and @dnd-kit's Cursor plugin is to inject a global
// style that forces the cursor on EVERY element for the duration of the
// gesture. WebKit honours that because it is a document-wide rule, not a class
// swap on the pressed node.
//
// The hard part is cleanup: the previous attempt left the global cursor stuck
// when a gesture was interrupted (notably Vite HMR swapping a component
// mid-drag, so the React cleanup never ran). This module fixes that with
// document-level safety nets that force-clear the cursor on pointerup,
// pointercancel, window blur, tab visibility change, and HMR dispose. None of
// those depend on a component lifecycle, so the cursor can never get stuck.

type CursorKind = "move" | "resize";

const STYLE_ID = "dp-drag-cursor";

// The cursor to paint for each gesture kind. Hand-for-everything: once you have
// engaged a block (move or resize) you are holding it, so both show grabbing,
// held for the entire gesture.
const CURSOR_FOR_KIND: Record<CursorKind, string> = {
  move: "grabbing",
  resize: "grabbing",
};

let activeKind: CursorKind | null = null;
let safetyNetsInstalled = false;

function styleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

// Install one-time, document-wide listeners that force-clear the global cursor
// ONLY when a gesture is abandoned without its owner ending it. The gesture
// owner (dnd-kit's onDragEnd/onDragCancel, or the resize handler's own
// pointerup/pointercancel) is responsible for calling end() on normal
// completion. We deliberately do NOT clear on a global pointerup/pointercancel
// here: WKWebView can fire a spurious pointercancel mid-gesture, and a global
// listener clearing on it would wipe the cursor of an in-flight resize. These
// nets only catch focus loss, tab hide, and module hot-replace.
function installSafetyNets() {
  if (safetyNetsInstalled) return;
  safetyNetsInstalled = true;
  window.addEventListener("blur", end, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") end();
  });
}

/** Begin showing a global drag cursor for the given gesture kind. */
export function begin(kind: CursorKind) {
  installSafetyNets();
  activeKind = kind;
  const cursor = CURSOR_FOR_KIND[kind];
  // `!important` beats every element's own cursor rule; `*` covers wherever the
  // pointer roams during the drag (empty timeline, other panels, etc.).
  styleEl().textContent = `* { cursor: ${cursor} !important; }`;
}

/** Remove the global drag cursor. Safe to call any number of times. */
export function end() {
  if (activeKind === null) {
    // Still make sure no stale style lingers (e.g. left over from an HMR swap).
    const el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (el && el.textContent) el.textContent = "";
    return;
  }
  activeKind = null;
  const el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el) el.textContent = "";
}

// Clear on hot module dispose so a mid-gesture HMR reload of this module cannot
// leave the global cursor stuck.
if (import.meta.hot) {
  import.meta.hot.dispose(() => end());
}
