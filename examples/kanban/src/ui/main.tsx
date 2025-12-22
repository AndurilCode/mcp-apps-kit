import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@apps-builder/ui-react";
import { App } from "./App";
import "./styles.css";

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
    <AppsProvider fallback={<Loading />}>
      <App />
    </AppsProvider>
  </React.StrictMode>
);
