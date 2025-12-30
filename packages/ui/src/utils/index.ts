/**
 * Utility functions for MCP Apps
 *
 * @internal
 * @packageDocumentation
 */

export { applyDocumentTheme, getDocumentTheme } from "./theme";
export type { Theme } from "./theme";

export {
  applyHostStyleVariables,
  applyHostFonts,
  removeHostFonts,
  clearHostStyleVariables,
} from "./styles";
