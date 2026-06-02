import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { FocusWidget } from "./components/FocusWidget";
import { FOCUS_WIDGET_LABEL } from "./lib/focusBridge";
import { applyTheme, DEFAULT_THEME } from "./lib/themes";
import { readString } from "./lib/prefs";
import "./index.css";

// Apply the saved theme synchronously, BEFORE React renders, so there is no
// flash of the default theme. This runs for BOTH webview windows (the focus
// widget also boots through main.tsx), so the widget inherits the saved theme on
// launch. localStorage is shared across both windows of the same app.
applyTheme(readString("theme", DEFAULT_THEME));

// Both webview windows load the same bundle/index.html. We branch the mount on
// the window label read synchronously: the "focus-widget" window renders the
// thin FocusWidget; every other window (the "main" planner) renders the full App.
const label = getCurrentWindow().label;
const isFocusWidget = label === FOCUS_WIDGET_LABEL;

// The widget window is natively transparent; flag the document so html/body/#root
// drop their opaque background and only the rounded badge card stays visible.
if (isFocusWidget) {
  document.documentElement.classList.add("focus-widget-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isFocusWidget ? <FocusWidget /> : <App />}
  </React.StrictMode>,
);
