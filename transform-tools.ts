#!/usr/bin/env tsx
/**
 * Phase 2 transformer: Update all tool factories to use ConnectionRegistry
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, "packages/inspector/src/tools");
const CONNECTION_ID_FIELD = `connectionId: z.string().optional().describe("Connection ID. Defaults to active connection.")`;

// Files to skip (special handling or no factory functions)
const SKIP_FILES = new Set(["helpers.ts", "index.ts", "list-connections.ts"]);
// Files with special handling
const SPECIAL_FILES = new Set(["connect.ts", "disconnect.ts", "status.ts"]);

function transformToolFile(filePath: string, fileName: string): void {
  let content = readFileSync(filePath, "utf-8");
  const original = content;

  // 1. Replace ConnectionManager import with ConnectionRegistry
  content = content.replace(
    /import type \{ ConnectionManager \} from "\.\.\/connection";/g,
    `import type { ConnectionRegistry } from "../connection-registry";`
  );

  // 2. Replace factory function signatures
  content = content.replace(
    /\(connectionManager: ConnectionManager\)/g,
    `(registry: ConnectionRegistry)`
  );

  // 3. Add connectionId to input schemas
  // Handle empty schemas: z.object({}).describe("No input required")
  content = content.replace(
    /z\.object\(\{\}\)\.describe\("No input required"\)/g,
    `z.object({\n  ${CONNECTION_ID_FIELD},\n})`
  );

  // Handle empty schemas without .describe: z.object({})
  // (but not ones we just replaced above - check for connectionId)
  content = content.replace(
    /(InputSchema = )z\.object\(\{\}\)/g,
    `$1z.object({\n  ${CONNECTION_ID_FIELD},\n})`
  );

  // Handle schemas with existing fields - add connectionId as first field
  // Only if connectionId not already present
  if (!content.includes("connectionId: z.string")) {
    const schemaRegex = /(export const \w+InputSchema = z\.object\(\{)\n/g;
    content = content.replace(schemaRegex, `$1\n  ${CONNECTION_ID_FIELD},\n`);
  } else {
    // connectionId already added by empty schema replacement,
    // but there might be OTHER schemas that need it too
    // Find schemas that DON'T have connectionId yet
    const lines = content.split("\n");
    const result: string[] = [];
    let inSchema = false;
    let schemaHasConnectionId = false;
    let schemaStartIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/export const \w+InputSchema = z\.object\(\{/)) {
        inSchema = true;
        schemaHasConnectionId = false;
        schemaStartIdx = i;
      }
      if (inSchema && lines[i].includes("connectionId")) {
        schemaHasConnectionId = true;
      }
      if (inSchema && lines[i].match(/^\}\)/) && !schemaHasConnectionId) {
        // End of schema without connectionId - add it
        result.push(`  ${CONNECTION_ID_FIELD},`);
        inSchema = false;
      }
      if (inSchema && lines[i].match(/^\}\)/)) {
        inSchema = false;
      }
      result.push(lines[i]);
    }
    content = result.join("\n");
  }

  // 4. Add registry.resolveConnection() at start of handlers
  // Pattern: handler: async (input) or handler: async ()
  // Replace async (): with async (input): and add resolve line
  content = content.replace(/handler: async \(\): Promise/g, `handler: async (input): Promise`);

  // Add resolveConnection after handler opening
  // Match: handler: async (input): Promise<...> => {
  content = content.replace(
    /(handler: async \(input\): Promise<[^>]+> => \{)\n/g,
    `$1\n      const connectionManager = registry.resolveConnection(input.connectionId);\n`
  );

  // Also handle handlers without explicit return type
  // handler: async (input) => {
  content = content.replace(
    /(handler: async \(input\) => \{)\n/g,
    `$1\n      const connectionManager = registry.resolveConnection(input.connectionId);\n`
  );

  if (content !== original) {
    writeFileSync(filePath, content);
    console.log(`✓ ${fileName}`);
  } else {
    console.log(`  ${fileName} (no changes)`);
  }
}

// Process all tool files
const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".ts"));
for (const fileName of files) {
  if (SKIP_FILES.has(fileName) || SPECIAL_FILES.has(fileName)) {
    console.log(`⊘ ${fileName} (skipped)`);
    continue;
  }
  transformToolFile(join(TOOLS_DIR, fileName), fileName);
}

console.log("\nDone. Special files (connect, disconnect, status) need manual editing.");
