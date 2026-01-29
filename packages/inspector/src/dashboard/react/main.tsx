/**
 * Dashboard Entry Point
 *
 * Main entry point for the Inspector Dashboard React application.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { InspectorDashboard } from "./InspectorDashboard";
import "./keyframes.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <InspectorDashboard />
    </React.StrictMode>
  );
}
