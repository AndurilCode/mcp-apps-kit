/**
 * Naming convention utilities for file-based tool discovery
 *
 * Converts file paths to snake_case identifiers following these rules:
 * - `greet.ts` → `greet`
 * - `search-restaurants.ts` → `search_restaurants` (kebab → snake)
 * - `SearchResults.tsx` → `search_results` (PascalCase → snake)
 * - `admin/delete-user.ts` → `admin_delete_user` (path segments joined with _)
 * - `_helpers.ts` → skipped (underscore-prefixed files are private)
 * - `index.ts` → skipped (index files are not processed)
 */

import * as path from "node:path";

/**
 * Valid file extensions for discovery
 */
export const VALID_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;

/**
 * Check if a file should be skipped (private/utility or index)
 *
 * @param filePath - File path to check
 * @returns true if the file should be skipped
 */
export function shouldSkipFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");

  // Skip underscore-prefixed files (private/utility)
  if (nameWithoutExt.startsWith("_")) {
    return true;
  }

  // Skip index files
  if (nameWithoutExt === "index") {
    return true;
  }

  return false;
}

/**
 * Check if a file has a valid extension
 *
 * @param filePath - File path to check
 * @returns true if the file has a valid extension
 */
export function hasValidExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (VALID_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Convert a single segment (file or directory name) to snake_case
 *
 * Handles:
 * - kebab-case: `search-restaurants` → `search_restaurants`
 * - PascalCase: `SearchResults` → `search_results`
 * - camelCase: `searchResults` → `search_results`
 *
 * @param segment - Single name segment to convert
 * @returns snake_case version of the segment
 */
export function segmentToSnakeCase(segment: string): string {
  // Remove file extension if present
  const nameWithoutExt = segment.replace(/\.[^.]+$/, "");

  // First, replace kebab-case with underscores
  let result = nameWithoutExt.replace(/-/g, "_");

  // Then, handle PascalCase/camelCase by inserting underscores before uppercase letters
  // but only when preceded by a lowercase letter or followed by lowercase letters
  result = result
    // Insert underscore between lowercase and uppercase
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    // Insert underscore between multiple uppercase followed by lowercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");

  // Convert to lowercase
  return result.toLowerCase();
}

/**
 * Convert a relative file path to a snake_case identifier
 *
 * @param relativePath - Relative path from the resource directory (e.g., "admin/delete-user.ts")
 * @returns snake_case identifier (e.g., "admin_delete_user")
 *
 * @example
 * ```typescript
 * pathToIdentifier("greet.ts"); // "greet"
 * pathToIdentifier("search-restaurants.ts"); // "search_restaurants"
 * pathToIdentifier("SearchResults.tsx"); // "search_results"
 * pathToIdentifier("admin/delete-user.ts"); // "admin_delete_user"
 * pathToIdentifier("api/v1/GetUsers.ts"); // "api_v1_get_users"
 * ```
 */
export function pathToIdentifier(relativePath: string): string {
  // Normalize path separators
  const normalized = relativePath.replace(/\\/g, "/");

  // Split into directory segments and file name
  const parts = normalized.split("/");

  // Convert each part to snake_case and join with underscores
  const segments = parts.map((part) => segmentToSnakeCase(part));

  return segments.join("_");
}

/**
 * Convert a relative file path to a camelCase tool name
 *
 * Uses pathToIdentifier internally and converts snake_case to camelCase.
 *
 * @param relativePath - Relative path from the resource directory (e.g., "admin/delete-user.ts")
 * @returns camelCase tool name (e.g., "adminDeleteUser")
 *
 * @example
 * ```typescript
 * pathToToolName("greet.ts"); // "greet"
 * pathToToolName("get-current-weather.ts"); // "getCurrentWeather"
 * pathToToolName("SearchResults.tsx"); // "searchResults"
 * pathToToolName("admin/delete-user.ts"); // "adminDeleteUser"
 * pathToToolName("api/v1/GetUsers.ts"); // "apiV1GetUsers"
 * ```
 */
export function pathToToolName(relativePath: string): string {
  const snakeCase = pathToIdentifier(relativePath);
  // Convert snake_case to camelCase
  return snakeCase.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Validate that an identifier is a valid JavaScript identifier
 *
 * @param identifier - The identifier to validate
 * @returns true if the identifier is valid
 */
export function isValidIdentifier(identifier: string): boolean {
  // Must start with letter or underscore, followed by letters, digits, or underscores
  return /^[a-z_][a-z0-9_]*$/i.test(identifier);
}

/**
 * Check for naming collisions in a set of discovered files
 *
 * @param files - Array of discovered file info with identifiers
 * @returns Map of colliding identifier to array of file paths
 */
export function findNameCollisions(
  files: Array<{ identifier: string; filePath: string }>
): Map<string, string[]> {
  const identifierToFiles = new Map<string, string[]>();

  for (const file of files) {
    const existing = identifierToFiles.get(file.identifier);
    if (existing) {
      existing.push(file.filePath);
    } else {
      identifierToFiles.set(file.identifier, [file.filePath]);
    }
  }

  // Filter to only collisions (more than one file per identifier)
  const collisions = new Map<string, string[]>();
  for (const [identifier, paths] of identifierToFiles) {
    if (paths.length > 1) {
      collisions.set(identifier, paths);
    }
  }

  return collisions;
}

/**
 * Generate a unique import alias for a file
 *
 * When importing files that resolve to the same identifier,
 * we need unique import aliases.
 *
 * @param identifier - Base identifier
 * @param existingAliases - Set of already-used aliases
 * @returns Unique alias
 */
export function generateUniqueAlias(identifier: string, existingAliases: Set<string>): string {
  if (!existingAliases.has(identifier)) {
    existingAliases.add(identifier);
    return identifier;
  }

  let counter = 2;
  let alias = `${identifier}_${counter}`;
  while (existingAliases.has(alias)) {
    counter++;
    alias = `${identifier}_${counter}`;
  }
  existingAliases.add(alias);
  return alias;
}

/**
 * Get the relative import path from the output directory to a source file
 *
 * @param outDir - Output directory for the manifest
 * @param sourceFile - Source file path
 * @param projectRoot - Project root directory
 * @param useJsExtension - Whether to use .js extension for ESM compatibility. Default: true
 * @returns Relative import path
 */
export function getRelativeImportPath(
  outDir: string,
  sourceFile: string,
  projectRoot: string,
  useJsExtension: boolean = true
): string {
  // Get relative path from outDir to sourceFile
  const outDirAbs = path.resolve(projectRoot, outDir);
  const sourceFileAbs = path.resolve(projectRoot, sourceFile);

  // Calculate relative path
  let relativePath = path.relative(outDirAbs, sourceFileAbs);

  // Normalize to forward slashes for ESM imports
  relativePath = relativePath.replace(/\\/g, "/");

  // Replace extension with .js for ESM compatibility (NodeNext moduleResolution)
  // or remove extension entirely if useJsExtension is false
  if (useJsExtension) {
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, ".js");
  } else {
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  // Ensure it starts with ./
  if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
    relativePath = `./${relativePath}`;
  }

  return relativePath;
}
