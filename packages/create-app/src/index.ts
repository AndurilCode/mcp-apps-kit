/**
 * @apps-builder/create-app
 *
 * CLI tool for scaffolding MCP applications.
 */

export interface CreateAppOptions {
  name: string;
  template: "react" | "vanilla";
  directory?: string;
}

// Main scaffolding function (placeholder - will be implemented in Phase 10)
export async function scaffoldProject(_options: CreateAppOptions): Promise<void> {
  throw new Error("Not implemented yet - Phase 10");
}
