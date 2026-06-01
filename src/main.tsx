import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { FocusWidget } from "./components/FocusWidget";
import { FOCUS_WIDGET_LABEL } from "./lib/focusBridge";
import "./index.css";

// Both webview windows load the same bundle/index.html. We branch the mount on
// the window label read synchronously: the "focus-widget" window renders the
// thin FocusWidget; every other window (the "main" planner) renders the full App.
const label = getCurrentWindow().label;
const isFocusWidget = label === FOCUS_WIDGET_LABEL;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isFocusWidget ? <FocusWidget /> : <App />}
  </React.StrictMode>,
);
