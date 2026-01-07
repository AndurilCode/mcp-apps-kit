/**
 * Test setup for minimal example
 *
 * Configures:
 * - Vitest matchers from @mcp-apps-kit/testing
 * - Testing Library matchers for DOM assertions
 */

import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";
import "@testing-library/jest-dom/vitest";

setupVitestMatchers();
