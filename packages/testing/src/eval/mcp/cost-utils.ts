/**
 * Cost Utilities for MCP Eval
 *
 * Shared utilities for parsing and formatting cost strings.
 */

/**
 * Parse a cost string to dollars.
 *
 * Handles both dollar ($) and cent (¢) formats, always returning the value in dollars.
 *
 * @param cost - Cost string like "$0.001234" or "0.5¢"
 * @returns The cost value in dollars
 *
 * @example
 * ```typescript
 * parseCostToDollars("$0.001234"); // returns 0.001234
 * parseCostToDollars("0.5¢");      // returns 0.005
 * parseCostToDollars("$1.50");     // returns 1.50
 * parseCostToDollars("50¢");       // returns 0.50
 * ```
 */
export function parseCostToDollars(cost: string | undefined): number {
  if (!cost) {
    return 0;
  }

  const isCents = cost.includes("¢");
  const numericValue = parseFloat(cost.replace(/[$¢]/g, ""));

  if (isNaN(numericValue)) {
    return 0;
  }

  // Convert cents to dollars if needed
  return isCents ? numericValue / 100 : numericValue;
}

/**
 * Format a dollar amount as a cost string.
 *
 * @param dollars - The cost in dollars
 * @param precision - Number of decimal places (default: 6)
 * @returns Formatted cost string like "$0.001234"
 */
export function formatCostAsDollars(dollars: number, precision: number = 6): string {
  return `$${dollars.toFixed(precision)}`;
}
