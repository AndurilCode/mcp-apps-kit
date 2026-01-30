/**
 * Test helpers for inspector tools.
 */

import type { ConnectionParams } from "@mcp-apps-kit/testing";
import type { ConnectionManager } from "../src/connection";
import type { ConnectionInfo, ConnectionRegistry } from "../src/connection-registry";
import type { ConnectOptions } from "../src/types";

export function createMockRegistry(manager: ConnectionManager): ConnectionRegistry {
  let activeId: string | null = manager.id;

  const listConnections = (): ConnectionInfo[] => {
    const state = manager.getState();
    return [
      {
        id: manager.id,
        connected: state.connected,
        serverUrl: state.serverUrl,
        serverInfo: state.serverInfo,
        historyEnabled: state.historyEnabled,
        callCount: state.callCount,
      },
    ];
  };

  const getConnection = (id: string): ConnectionManager => {
    if (id !== manager.id) {
      throw new Error(`Connection not found: ${id}`);
    }
    return manager;
  };

  const getActiveConnection = (): ConnectionManager => {
    if (!activeId) {
      throw new Error("No active connection available.");
    }
    return manager;
  };

  const resolveConnection = (connectionId?: string): ConnectionManager => {
    if (connectionId && connectionId !== manager.id) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    activeId = manager.id;
    return manager;
  };

  const setActive = (id: string): void => {
    if (id !== manager.id) {
      throw new Error(`Connection not found: ${id}`);
    }
    activeId = id;
  };

  const createConnection = async (
    params: ConnectionParams,
    options?: ConnectOptions
  ): Promise<{ id: string; connectionManager: ConnectionManager }> => {
    await manager.connect(params, options);
    activeId = manager.id;
    return { id: manager.id, connectionManager: manager };
  };

  const closeConnection = async (id: string): Promise<void> => {
    if (id !== manager.id) {
      throw new Error(`Connection not found: ${id}`);
    }
    await manager.disconnect();
    activeId = null;
  };

  return {
    listConnections,
    getConnection,
    getActiveConnection,
    resolveConnection,
    setActive,
    createConnection,
    closeConnection,
  } as unknown as ConnectionRegistry;
}
