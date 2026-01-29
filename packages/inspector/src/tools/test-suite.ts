/**
 * run_test_suite tool
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import { defineTestSuite, runTestSuite } from "@mcp-apps-kit/testing";
import type { ConnectionManager } from "../connection";
import type { RunTestSuiteOutput } from "../types";

export const testCaseSchema = z.object({
  name: z.string().describe("Test case name"),
  input: z.record(z.string(), z.unknown()).describe("Input arguments for the tool"),
  expected: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Expected output (partial match)"),
  skip: z.boolean().optional().describe("Skip this test case"),
});

export const testSuiteSchema = z.object({
  name: z.string().describe("Test suite name"),
  tool: z.string().describe("Name of the tool to test"),
  cases: z.array(testCaseSchema).describe("Test cases to run"),
});

export const runTestSuiteInputSchema = z.object({
  suite: testSuiteSchema.describe("Test suite configuration"),
});

export const runTestSuiteOutputSchema = z.object({
  suiteName: z.string(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  total: z.number(),
  duration: z.number(),
  results: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["passed", "failed", "skipped"]),
      duration: z.number(),
      error: z.string().optional(),
      actual: z.unknown().optional(),
      expected: z.unknown().optional(),
    })
  ),
});

export function createRunTestSuiteTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Run a test suite against a tool on the connected MCP server. Executes all test cases and returns results including pass/fail status and timing.",
    input: runTestSuiteInputSchema,
    output: runTestSuiteOutputSchema,
    handler: async (input): Promise<RunTestSuiteOutput> => {
      const client = connectionManager.getClient();

      // Convert input to test suite format
      const suite = defineTestSuite({
        name: input.suite.name,
        tool: input.suite.tool,
        cases: input.suite.cases.map((tc) => ({
          name: tc.name,
          input: tc.input,
          expected: tc.expected,
          skip: tc.skip,
        })),
      });

      // Run the test suite
      const result = await runTestSuite(client, suite);

      // Convert to output format
      return {
        suiteName: result.name,
        passed: result.passed,
        failed: result.failed,
        skipped: result.skipped,
        total: result.total,
        duration: result.duration,
        results: result.cases.map((c) => ({
          name: c.name,
          status: c.status,
          duration: c.duration,
          error: c.error?.message,
          actual: c.actual,
          expected: c.expected,
        })),
      };
    },
  });
}
