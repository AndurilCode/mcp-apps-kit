import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: "./src/dashboard/react",
  build: {
    outDir: "../../../dist/dashboard",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/dashboard/react/index.html"),
    },
  },
});
