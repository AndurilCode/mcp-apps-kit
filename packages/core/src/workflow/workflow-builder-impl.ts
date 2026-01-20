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
import { WorkflowExecutor } from "./executor";

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

    // Create workflow executor
    const executor = new WorkflowExecutor({
      name: builder.config.name,
      description: builder.config.description,
      inputSchema: builder.config.inputSchema,
      outputSchema: builder.config.outputSchema,
      steps: builder.config.steps,
    });

    // Create tool definition with workflow handler
    const toolDef: ToolDef<TInput, TOutput> = {
      description: builder.config.description,
      title: builder.config.name,
      input: builder.config.inputSchema as TInput,
      output: builder.config.outputSchema as TOutput,
      ui: builder.config.ui,
      handler: async (input: z.infer<TInput>, context: ToolContext) => {
        // Execute workflow
        const result = await executor.execute(input, context);

        // Return workflow output with metadata support
        return result.output as z.infer<TOutput> & {
          _meta?: Record<string, unknown>;
          _text?: string;
          _closeWidget?: boolean;
        };
      },
    };

    return toolDef;
  }
}
