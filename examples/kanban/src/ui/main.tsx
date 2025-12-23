import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import { App } from "./App";
import "./styles.css";
import type { KanbanClientTools } from "../index";

function Loading() {
  return (
    <div className="board-container">
      <div className="loading">
        <div className="spinner" />
        <span>Connecting...</span>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppsProvider<KanbanClientTools> fallback={<Loading />}>
      <App />
    </AppsProvider>
  </React.StrictMode>
);
