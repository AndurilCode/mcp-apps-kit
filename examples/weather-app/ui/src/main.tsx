/**
 * @mcp-apps-kit/example-weather-app - UI Entry Point
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <React.StrictMode>
    <AppsProvider>
      <App />
    </AppsProvider>
  </React.StrictMode>
);
