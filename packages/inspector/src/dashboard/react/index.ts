/**
 * Inspector Dashboard - React Components
 *
 * React implementation of the MCP Inspector Dashboard.
 *
 * @example
 * ```tsx
 * import { InspectorDashboard } from '@mcp-apps-kit/inspector/dashboard/react';
 *
 * function App() {
 *   return (
 *     <div style={{ height: '100vh' }}>
 *       <InspectorDashboard baseUrl="http://localhost:3000" />
 *     </div>
 *   );
 * }
 * ```
 */

export { InspectorDashboard, type InspectorDashboardProps } from "./InspectorDashboard";
export { styles } from "./styles";

// Re-export hooks for custom implementations
export {
  useSessions,
  useSessionStream,
  useLogStream,
  useResizablePanel,
  type SessionInfo,
  type UseSessionsResult,
  type SessionEntry,
  type UseSessionStreamResult,
  type LogEntry,
  type UseLogStreamResult,
  type UseResizablePanelOptions,
  type UseResizablePanelResult,
} from "./hooks";
