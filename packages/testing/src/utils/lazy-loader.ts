/**
 * Shared lazy loading utilities
 *
 * Provides a consistent pattern for lazy-loading optional dependencies.
 * This reduces bundle impact and allows the library to work even when
 * optional dependencies are not installed.
 */

import { ConfigurationError } from "../errors";

/**
 * State for a lazy-loaded module
 */
interface LazyModuleState<T> {
  module: T | null;
  loadPromise: Promise<T> | null;
}

/**
 * Options for creating a lazy loader
 */
interface LazyLoaderOptions {
  /** Name of the package (for error messages) */
  packageName: string;
  /** Install command hint (e.g., "npm install -D fast-check") */
  installHint: string;
}

/**
 * Create a lazy loader for an optional dependency
 *
 * @param importFn - Function that performs the dynamic import
 * @param options - Loader configuration
 * @returns A function that loads the module lazily
 *
 * @example
 * ```typescript
 * const getFastCheck = createLazyLoader(
 *   () => import("fast-check"),
 *   { packageName: "fast-check", installHint: "npm install -D fast-check" }
 * );
 *
 * // Usage
 * const fc = await getFastCheck();
 * ```
 */
export function createLazyLoader<T>(
  importFn: () => Promise<T>,
  options: LazyLoaderOptions
): () => Promise<T> {
  const state: LazyModuleState<T> = {
    module: null,
    loadPromise: null,
  };

  return async function getModule(): Promise<T> {
    // Return cached module if available
    if (state.module) {
      return state.module;
    }

    // Return existing promise if load is in progress
    if (state.loadPromise) {
      return state.loadPromise;
    }

    // Start loading
    state.loadPromise = (async () => {
      try {
        const module = await importFn();
        state.module = module;
        return module;
      } catch {
        throw new ConfigurationError(
          options.packageName,
          `${options.packageName} is required for this feature. Install it with: ${options.installHint}`
        );
      }
    })();

    return state.loadPromise;
  };
}

/**
 * Create a cached client factory for SDK clients
 *
 * This handles the common pattern of creating a client instance
 * that should be reused across calls but recreated if the API key changes.
 *
 * @param createClient - Function to create a new client instance
 * @returns A function that gets or creates the client
 *
 * @example
 * ```typescript
 * const getOpenAIClient = createCachedClientFactory(
 *   async (apiKey) => {
 *     const openai = await getOpenAI();
 *     return new openai.OpenAI({ apiKey });
 *   }
 * );
 *
 * // Usage
 * const client = await getOpenAIClient(apiKey);
 * ```
 */
export function createCachedClientFactory<TClient>(
  createClient: (apiKey: string) => Promise<TClient>
): {
  get: (apiKey: string) => Promise<TClient>;
  clear: () => void;
} {
  let cachedClient: TClient | null = null;
  let cachedApiKey: string | null = null;

  return {
    async get(apiKey: string): Promise<TClient> {
      if (cachedClient && cachedApiKey === apiKey) {
        return cachedClient;
      }

      cachedClient = await createClient(apiKey);
      cachedApiKey = apiKey;
      return cachedClient;
    },

    /**
     * Clear the cached client (useful for testing)
     */
    clear(): void {
      cachedClient = null;
      cachedApiKey = null;
    },
  };
}

/**
 * Check if an optional dependency is available without throwing
 *
 * @param importFn - Function that performs the dynamic import
 * @returns Whether the dependency is available
 *
 * @example
 * ```typescript
 * const hasFastCheck = await isModuleAvailable(() => import("fast-check"));
 * if (hasFastCheck) {
 *   // Use fast-check features
 * }
 * ```
 */
export async function isModuleAvailable(importFn: () => Promise<unknown>): Promise<boolean> {
  try {
    await importFn();
    return true;
  } catch {
    return false;
  }
}
