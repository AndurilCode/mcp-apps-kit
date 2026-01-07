/**
 * Test setup for minimal example
 *
 * Configures:
 * - Environment variables from .env file
 * - Vitest matchers from @mcp-apps-kit/testing
 * - Testing Library matchers for DOM assertions
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env file from the minimal example directory
config({ path: resolve(__dirname, "../.env") });

import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";
import "@testing-library/jest-dom/vitest";

setupVitestMatchers();
