/**
 * Workflow builder implementation
 *
 * @module workflow/workflow-builder-impl
 */

import { z } from "zod";
import type { ToolDef, ToolContext } from "../types/tools";
import type { UIDef } from "../types/ui";
import type {
  WorkflowBuilderInitial,
  WorkflowBuilderWithDescription,
  WorkflowBuilderWithInput,
  WorkflowBuilderWithOutput,
  WorkflowBuilderWithSteps,
  SchemaInput,
  NormalizedSchema,
} from "./workflow-builder";
import type {
  Step,
  StepConfig,
  NamedStep,
  WorkflowContext,
  BranchStep,
  ParallelStep,
} from "./types";
import { isZodSchema } from "../utils/schema";
import { WorkflowValidationError } from "./errors";
import { ExecutorManager } from "./executor-manager";
import { EdgeExecutorManager } from "./executor-manager-edge";
import { debugLogger } from "../debug/logger";

// Type declarations for edge runtime detection
declare const Deno: { env?: { get?: (key: string) => string | undefined } } | undefined;
declare const EdgeRuntime: string | undefined;
declare const WorkerGlobalScope: new () => unknown;
declare const self: unknown;

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Detect if we're running in an edge/serverless environment
 *
 * Edge environments are characterized by short-lived function invocations,
 * limited memory, and no persistent background processes.
 */
function isEdgeEnvironment(): boolean {
  // Vercel Edge Runtime
  if (typeof EdgeRuntime !== "undefined") return true;

  // Deno-based edge (Supabase Edge, Deno Deploy)
  if (typeof Deno !== "undefined") return true;

  // Cloudflare Workers - check specific user agent
  if (typeof navigator !== "undefined") {
    // Cloudflare Workers have a specific user agent
    if (
      typeof navigator === "object" &&
      navigator !== null &&
      "userAgent" in navigator &&
      navigator.userAgent === "Cloudflare-Workers"
    ) {
      return true;
    }
  }

  // Web Worker environments (includes Service Workers and Cloudflare Workers)
  if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined") {
    try {
      if (self instanceof WorkerGlobalScope) return true;
    } catch {
      // instanceof might fail in some environments, continue checking
    }
  }

  // Serverless environments (AWS Lambda, Google Cloud Functions, Vercel, Netlify)
  if (typeof process !== "undefined" && process.env) {
    const env = process.env;
    if (
      env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
      env.FUNCTION_NAME !== undefined ||
      env.VERCEL !== undefined ||
      env.NETLIFY !== undefined
    ) {
      return true;
    }
  }

  return false;
}

// Module-level cache for edge executor manager
// In edge environments, this prevents creating multiple managers per invocation
let cachedEdgeManager: EdgeExecutorManager | null = null;

/**
 * Reset the cached edge executor manager
 *
 * This is primarily for testing purposes. In production edge environments,
 * the manager is automatically garbage collected when the function instance terminates.
 *
 * @internal
 */
export async function resetEdgeExecutorManagerCache(): Promise<void> {
  if (cachedEdgeManager) {
    try {
      await cachedEdgeManager.shutdown();
    } catch (error) {
      // Log but don't throw - allow reset to complete
      debugLogger.error("Error shutting down cached edge executor manager", { error });
    } finally {
      // Always clear the cache even if shutdown failed
      cachedEdgeManager = null;
    }
  }
}

/**
 * Get the appropriate executor manager for the current environment
 *
 * For edge environments, returns a cached manager to prevent accumulation
 * in the global cleanup registry. The cached manager is reused across
 * tool invocations within the same function instance.
 */
function getExecutorManagerForEnvironment() {
  if (isEdgeEnvironment()) {
    // Edge: use cached manager per function instance (prevents accumulation)
    // The manager will be garbage collected when the function instance terminates
    cachedEdgeManager ??= new EdgeExecutorManager();
    return cachedEdgeManager;
  } else {
    // Traditional: use global singleton with pooling
    return ExecutorManager.getInstance();
  }
}

// =============================================================================
// INTERNAL BUILDER CONFIG
// =============================================================================

interface WorkflowBuilderConfig {
  name: string;
  description?: string;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  steps: NamedStep[];
  ui?: UIDef;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize schema input to ZodType
 */
function normalizeSchema<T extends SchemaInput>(schema: T): NormalizedSchema<T> {
  if (isZodSchema(schema)) {
    return schema as NormalizedSchema<T>;
  }

  return z.object(schema) as NormalizedSchema<T>;
}

/**
 * Validate step name is unique
 */
function validateStepName(steps: NamedStep[], name: string): void {
  if (steps.some((s) => s.name === name)) {
    throw new WorkflowValidationError(`Duplicate step name: "${name}"`);
  }
}

// =============================================================================
// WORKFLOW BUILDER IMPLEMENTATION
// =============================================================================

export class WorkflowBuilderImpl<TName extends string> implements WorkflowBuilderInitial<TName> {
  private config: WorkflowBuilderConfig;

  constructor(name: TName) {
    this.config = {
      name,
      steps: [],
    };
  }

  describe(description: string): WorkflowBuilderWithDescription<TName> {
    this.config.description = description;
    return this as unknown as WorkflowBuilderWithDescription<TName>;
  }

  input<TInput extends SchemaInput>(
    schema: TInput
  ): WorkflowBuilderWithInput<TName, NormalizedSchema<TInput>> {
    this.config.inputSchema = normalizeSchema(schema);
    return this as unknown as WorkflowBuilderWithInput<TName, NormalizedSchema<TInput>>;
  }

  output<TOutput extends SchemaInput, TInput extends z.ZodType>(
    this: WorkflowBuilderWithInput<TName, TInput>,
    schema: TOutput
  ): WorkflowBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>> {
    if (!(this instanceof WorkflowBuilderImpl)) {
      throw new Error("WorkflowBuilder method called with invalid context");
    }
    const builder = this as unknown as WorkflowBuilderImpl<TName>;
    builder.config.outputSchema = normalizeSchema(schema);
    return this as unknown as WorkflowBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>>;
  }

  step(
    name: string,
    step: Step,
    config?: StepConfig
  ): WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType> {
    validateStepName(this.config.steps, name);

    // Merge config into step if provided
    const stepWithConfig: Step =
      config && step.type !== "parallel" && step.type !== "branch"
        ? { ...step, config: { ...step.config, ...config } }
        : step;

    this.config.steps.push({
      name,
      step: stepWithConfig,
    });

    return this as unknown as WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType>;
  }

  parallel(
    name: string,
    steps: Step[],
    config?: Omit<StepConfig, "mapInput">
  ): WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType> {
    validateStepName(this.config.steps, name);

    const parallelStep: ParallelStep = {
      type: "parallel",
      steps,
      config,
    };

    this.config.steps.push({
      name,
      step: parallelStep,
    });

    return this as unknown as WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType>;
  }

  branch(
    name: string,
    branchConfig: {
      when: (context: WorkflowContext) => boolean | Promise<boolean>;
      then: Step[];
      else?: Step[];
    }
  ): WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType> {
    validateStepName(this.config.steps, name);

    const branchStep: BranchStep = {
      type: "branch",
      condition: branchConfig.when,
      thenSteps: branchConfig.then,
      elseSteps: branchConfig.else,
    };

    this.config.steps.push({
      name,
      step: branchStep,
    });

    return this as unknown as WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType>;
  }

  ui(uiDef: UIDef): WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType> {
    this.config.ui = uiDef;
    return this as unknown as WorkflowBuilderWithSteps<TName, z.ZodType, z.ZodType>;
  }

  build<TInput extends z.ZodType, TOutput extends z.ZodType>(
    this:
      | WorkflowBuilderWithInput<TName, TInput>
      | WorkflowBuilderWithOutput<TName, TInput, TOutput>
      | WorkflowBuilderWithSteps<TName, TInput, TOutput>
  ): ToolDef<TInput, TOutput> {
    if (!(this instanceof WorkflowBuilderImpl)) {
      throw new Error("WorkflowBuilder method called with invalid context");
    }
    const builder = this as unknown as WorkflowBuilderImpl<TName>;

    // Validate required fields
    if (!builder.config.description) {
      throw new WorkflowValidationError("Workflow requires description");
    }

    if (!builder.config.inputSchema) {
      throw new WorkflowValidationError("Workflow requires input schema");
    }

    if (builder.config.steps.length === 0) {
      throw new WorkflowValidationError("Workflow requires at least one step");
    }

    // Create workflow definition
    const definition = {
      name: builder.config.name,
      description: builder.config.description,
      inputSchema: builder.config.inputSchema,
      outputSchema: builder.config.outputSchema,
      steps: builder.config.steps,
    };

    // Create tool definition with workflow handler
    // The ExecutorManager provides:
    // - Executor pooling and reuse across invocations (optimal performance)
    // - Automatic cleanup of idle executors (prevents memory leaks)
    // - LRU eviction when pool is full (bounded resource usage)
    // - Reference counting to prevent cleanup during execution
    // - Graceful shutdown hooks (proper cleanup on server stop)
    //
    // In edge environments, pooling is per-invocation and cleanup
    // happens automatically when the function terminates.
    const toolDef: ToolDef<TInput, TOutput> = {
      description: builder.config.description,
      title: builder.config.name,
      input: builder.config.inputSchema as TInput,
      output: builder.config.outputSchema as TOutput,
      ui: builder.config.ui,
      handler: async (input: z.infer<TInput>, context: ToolContext) => {
        // Get the appropriate executor manager for the environment at invocation time
        // - Edge/Serverless: creates new manager per invocation (no singleton)
        // - Traditional: uses global singleton with pooling and background cleanup
        const executorManager = getExecutorManagerForEnvironment();

        // Get or create the executor (reused across invocations)
        const executor = executorManager.getOrCreate(definition);

        // Mark as in-use to prevent cleanup during execution
        executorManager.markInUse(definition.name);

        try {
          // Execute workflow
          const result = await executor.execute(input, context);

          // Return workflow output with metadata support
          return result.output as z.infer<TOutput> & {
            _meta?: Record<string, unknown>;
            _text?: string;
            _closeWidget?: boolean;
          };
        } finally {
          // Mark as idle - allows cleanup after TTL expires
          executorManager.markIdle(definition.name);
        }
      },
    };

    return toolDef;
  }
}
