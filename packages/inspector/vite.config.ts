import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
