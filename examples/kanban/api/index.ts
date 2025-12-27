/**
 * Vercel Serverless Function Entry Point
 *
 * This file re-exports the Express app from the main server for Vercel deployment.
 * Vercel automatically detects Express apps and wraps them as serverless functions.
 */

// Re-export the Express app from the main server
export { default } from "../src/index.js";
