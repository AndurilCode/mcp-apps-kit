/**
 * Retry and Rate Limiting utilities for MCP Eval
 *
 * Handles LLM API resilience: retries, timeouts, and rate limiting.
 */

import { llmLogger } from "../../debug";

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay between retries in ms (default: 1000) */
  delay?: number;
  /** Backoff strategy (default: "exponential") */
  backoff?: "fixed" | "exponential" | "linear";
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelay?: number;
  /** Jitter factor 0-1 to add randomness (default: 0.1) */
  jitter?: number;
  /** Error types to retry on (default: all transient errors) */
  retryOn?: Array<string | RegExp>;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum tokens per minute (if known) */
  tokensPerMinute?: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, "retryOn">> & {
  retryOn?: Array<string | RegExp>;
} = {
  maxAttempts: 3,
  delay: 1000,
  backoff: "exponential",
  maxDelay: 30000,
  jitter: 0.1,
  retryOn: undefined,
};

/**
 * Common transient error patterns
 */
const TRANSIENT_ERROR_PATTERNS = [
  /rate.?limit/i,
  /too.?many.?requests/i,
  /429/,
  /503/,
  /timeout/i,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /socket.?hang.?up/i,
  /overloaded/i,
  /capacity/i,
];

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: Error, retryOn?: Array<string | RegExp>): boolean {
  const errorMessage = error.message;
  const errorName = error.name;
  const fullError = `${errorName}: ${errorMessage}`;

  // Check custom patterns first
  if (retryOn && retryOn.length > 0) {
    for (const pattern of retryOn) {
      if (typeof pattern === "string") {
        if (fullError.includes(pattern)) return true;
      } else {
        if (pattern.test(fullError)) return true;
      }
    }
    return false;
  }

  // Check default transient patterns
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (pattern.test(fullError)) return true;
  }

  return false;
}

/**
 * Calculate delay for a retry attempt
 */
function calculateDelay(attempt: number, config: Required<Omit<RetryConfig, "retryOn">>): number {
  let delay = config.delay;

  switch (config.backoff) {
    case "exponential":
      delay = config.delay * Math.pow(2, attempt - 1);
      break;
    case "linear":
      delay = config.delay * attempt;
      break;
    case "fixed":
    default:
      delay = config.delay;
      break;
  }

  // Cap at maxDelay
  delay = Math.min(delay, config.maxDelay);

  // Add jitter
  if (config.jitter > 0) {
    const jitterAmount = delay * config.jitter;
    delay += Math.random() * jitterAmount * 2 - jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap an async function with retry logic
 *
 * @param fn - The async function to wrap
 * @param config - Retry configuration
 * @returns Wrapped function with retry behavior
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(
 *   async () => fetch("https://api.example.com"),
 *   { maxAttempts: 3, backoff: "exponential" }
 * );
 * ```
 */
export function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = {}): () => Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  return async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= mergedConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (attempt < mergedConfig.maxAttempts && isTransientError(lastError, config.retryOn)) {
          const delay = calculateDelay(attempt, mergedConfig);
          llmLogger(
            "Retry attempt %d/%d after %dms: %s",
            attempt,
            mergedConfig.maxAttempts,
            delay,
            lastError.message
          );
          await sleep(delay);
        } else {
          // Don't retry - either max attempts reached or non-transient error
          throw lastError;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
}

/**
 * Simple token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.refillRate = requestsPerMinute / 60000; // per ms
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a request can be made
   */
  async acquire(): Promise<void> {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    // If we have a token, use it
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate how long to wait for a token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    llmLogger("Rate limited, waiting %dms", waitTime);
    await sleep(waitTime);

    // Refill and acquire
    this.tokens = Math.min(this.maxTokens, this.tokens + waitTime * this.refillRate);
    this.tokens -= 1;
  }

  /**
   * Get current available tokens
   */
  getAvailableTokens(): number {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    return Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
  }
}

/**
 * Wrap an async function with timeout
 *
 * @param fn - The async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns Wrapped function with timeout
 */
export function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): () => Promise<T> {
  return async (): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([fn(), timeoutPromise]);
  };
}

/**
 * Combine retry, rate limiting, and timeout into a single wrapper
 */
export interface ResilienceConfig {
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  timeout?: number;
}

/**
 * Create a resilient wrapper combining retry, rate limiting, and timeout
 *
 * @param config - Resilience configuration
 * @returns A function that wraps async operations with resilience
 *
 * @example
 * ```typescript
 * const resilient = createResilientWrapper({
 *   retry: { maxAttempts: 3, backoff: "exponential" },
 *   rateLimit: { requestsPerMinute: 60 },
 *   timeout: 30000,
 * });
 *
 * const result = await resilient(() => llmApi.call());
 * ```
 */
export function createResilientWrapper(
  config: ResilienceConfig = {}
): <T>(fn: () => Promise<T>) => Promise<T> {
  // Create rate limiter if configured
  const rateLimiter = config.rateLimit?.requestsPerMinute
    ? new RateLimiter(config.rateLimit.requestsPerMinute)
    : null;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // Apply rate limiting first
    if (rateLimiter) {
      await rateLimiter.acquire();
    }

    // Apply timeout
    let wrappedFn = fn;
    if (config.timeout) {
      wrappedFn = withTimeout(fn, config.timeout);
    }

    // Apply retry
    if (config.retry) {
      wrappedFn = withRetry(wrappedFn, config.retry);
    }

    return wrappedFn();
  };
}
