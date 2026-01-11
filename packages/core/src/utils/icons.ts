/**
 * Icon utility functions for MCP server configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Icon, IconTheme } from "../types/config";

/**
 * MIME type mappings for common image formats
 */
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

/**
 * Options for creating an icon from a file
 */
export interface IconFromFileOptions {
  /**
   * Icon sizes in "WxH" format.
   * Use `["any"]` for scalable formats like SVG.
   *
   * @example ["48x48", "96x96"]
   */
  sizes?: string[];

  /**
   * Theme this icon is designed for.
   */
  theme?: IconTheme;

  /**
   * Override the auto-detected MIME type.
   */
  mimeType?: string;
}

/**
 * Create an Icon object from a local image file.
 *
 * Reads the file, converts it to a base64 data URI, and returns
 * an Icon object ready for use in createApp configuration.
 *
 * @param filePath - Path to the image file (absolute or relative to cwd)
 * @param options - Optional icon configuration (sizes, theme, mimeType override)
 * @returns Icon object with base64 data URI
 *
 * @example Basic usage
 * ```typescript
 * import { createApp, iconFromFile } from "@mcp-apps-kit/core";
 *
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   icons: [iconFromFile("./assets/icon.png")],
 *   tools: { ... }
 * });
 * ```
 *
 * @example With options
 * ```typescript
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   icons: [
 *     iconFromFile("./assets/icon-48.png", { sizes: ["48x48"] }),
 *     iconFromFile("./assets/icon-dark.png", { theme: "dark" }),
 *     iconFromFile("./assets/icon.svg", { sizes: ["any"] }),
 *   ],
 *   tools: { ... }
 * });
 * ```
 *
 * @throws Error if the file cannot be read or has an unsupported extension
 */
export function iconFromFile(filePath: string, options: IconFromFileOptions = {}): Icon {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  // Read file
  const fileBuffer = fs.readFileSync(absolutePath);

  // Detect MIME type from extension
  const ext = path.extname(absolutePath).toLowerCase();
  const detectedMimeType = MIME_TYPES[ext];

  if (!detectedMimeType && !options.mimeType) {
    throw new Error(
      `Unsupported image format: ${ext}. ` +
        `Supported formats: ${Object.keys(MIME_TYPES).join(", ")}. ` +
        `You can override this by providing a mimeType option.`
    );
  }

  const mimeType = options.mimeType ?? detectedMimeType;

  // Convert to base64 data URI
  const base64 = fileBuffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  // Build Icon object
  const icon: Icon = {
    src: dataUri,
    mimeType,
  };

  if (options.sizes) {
    icon.sizes = options.sizes;
  }

  if (options.theme) {
    icon.theme = options.theme;
  }

  return icon;
}
