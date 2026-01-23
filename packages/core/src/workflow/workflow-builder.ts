/**
 * Workflow builder interfaces
 *
 * @module workflow/workflow-builder
 */

import type { z } from "zod";
import type { ToolDef } from "../types/tools";
import type { UIDef } from "../types/ui";
import type { Step, StepConfig, WorkflowContext } from "./types";

// =============================================================================
// SCHEMA INPUT TYPES
// =============================================================================

/**
 * Input schema accepted by the builder
 */
export type SchemaInput = z.ZodType | z.ZodRawShape;

/**
 * Normalize raw Zod shapes into Zod objects
 */
export type NormalizedSchema<T extends SchemaInput> = T extends z.ZodType
  ? T
  : T extends z.ZodRawShape
    ? z.ZodObject<T>
    : never;

// =============================================================================
// BUILDER INTERFACES
// =============================================================================

/**
 * Step 1: Initial - requires description
 */
export interface WorkflowBuilderInitial<TName extends string> {
  /**
   * Set the workflow description (required)
   */
  describe(description: string): WorkflowBuilderWithDescription<TName>;
}

/**
 * Step 2: Has description - requires input
 */
export interface WorkflowBuilderWithDescription<TName extends string> {
  /**
   * Set the input schema (required)
   */
  input<TInput extends SchemaInput>(
    schema: TInput
  ): WorkflowBuilderWithInput<TName, NormalizedSchema<TInput>>;
}

/**
 * Step 3: Has input - can add output, steps, ui, or build
 */
export interface WorkflowBuilderWithInput<TName extends string, TInput extends z.ZodType> {
  /**
   * Set the output schema (optional)
   */
  output<TOutput extends SchemaInput>(
    schema: TOutput
  ): WorkflowBuilderWithOutput<TName, TInput, NormalizedSchema<TOutput>>;

  /**
   * Add a sequential step to the workflow
   */
  step(
    name: string,
    step: Step,
    config?: StepConfig
  ): WorkflowBuilderWithSteps<TName, TInput, z.ZodType>;

  /**
   * Add a parallel step group to the workflow
   */
  parallel(name: string, steps: Step[], config?: Omit<StepConfig, "mapInput">): this;

  /**
   * Add a conditional branch to the workflow
   */
  branch(
    name: string,
    config: {
      when: (context: WorkflowContext) => boolean | Promise<boolean>;
      then: Step[];
      else?: Step[];
    }
  ): this;

  /**
   * Add a UI definition to the workflow
   */
  ui(uiDef: UIDef): this;

  /**
   * Build the workflow into a ToolDef
   */
  build(): ToolDef<TInput>;
}

/**
 * Step 4: Has output - can add steps, ui, or build
 */
export interface WorkflowBuilderWithOutput<
  TName extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> {
  /**
   * Add a sequential step to the workflow
   */
  step(
    name: string,
    step: Step,
    config?: StepConfig
  ): WorkflowBuilderWithSteps<TName, TInput, TOutput>;

  /**
   * Add a parallel step group to the workflow
   */
  parallel(name: string, steps: Step[], config?: Omit<StepConfig, "mapInput">): this;

  /**
   * Add a conditional branch to the workflow
   */
  branch(
    name: string,
    config: {
      when: (context: WorkflowContext) => boolean | Promise<boolean>;
      then: Step[];
      else?: Step[];
    }
  ): this;

  /**
   * Add a UI definition to the workflow
   */
  ui(uiDef: UIDef): this;

  /**
   * Build the workflow into a ToolDef
   */
  build(): ToolDef<TInput, TOutput>;
}

/**
 * Step 5: Has steps - can add more steps, ui, or build
 */
export interface WorkflowBuilderWithSteps<
  TName extends string,
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> {
  /**
   * Add a sequential step to the workflow
   */
  step(
    name: string,
    step: Step,
    config?: StepConfig
  ): WorkflowBuilderWithSteps<TName, TInput, TOutput>;

  /**
   * Add a parallel step group to the workflow
   */
  parallel(name: string, steps: Step[], config?: Omit<StepConfig, "mapInput">): this;

  /**
   * Add a conditional branch to the workflow
   */
  branch(
    name: string,
    config: {
      when: (context: WorkflowContext) => boolean | Promise<boolean>;
      then: Step[];
      else?: Step[];
    }
  ): this;

  /**
   * Add a UI definition to the workflow
   */
  ui(uiDef: UIDef): this;

  /**
   * Build the workflow into a ToolDef
   */
  build(): ToolDef<TInput, TOutput>;
}
