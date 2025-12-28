/**
 * Minimal Example App
 *
 * A simple "hello world" example demonstrating basic @mcp-apps-kit/core usage:
 * - Simple tool definition with Zod schema
 * - UI resource binding
 * - Server startup
 * - Type-safe handlers using defineTool helper (no type assertions needed!)
 */

import { createApp, defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define schemas separately for clarity
const greetInput = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutput = z.object({
  message: z.string(),
  timestamp: z.string(),
});

// Use defineTool for full type safety - no type assertions needed!
const greetTool = defineTool({
  title: "Greet",
  description: "Greet someone by name",
  input: greetInput,
  output: greetOutput,
  ui: "greeting-widget",
  visibility: "both",
  handler: async (input, context) => {
    // input is automatically typed as { name: string }
    // No type assertion needed! ✅

    // With OAuth enabled: context.subject contains the authenticated user
    const userInfo = context.subject ? ` (authenticated as ${context.subject})` : "";
    const message = `Hello, ${input.name}${userInfo}!`;

    // Access full auth context when OAuth is enabled
    // const auth = context.raw?.["mcp-apps-kit/auth"];
    // const scopes = auth?.scopes ?? [];
    // const clientId = auth?.clientId;

    return {
      message,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  },
});

const app = createApp({
  name: "minimal-app",
  version: "1.0.0",

  tools: {
    greet: greetTool,
  },

  ui: {
    "greeting-widget": {
      name: "Greeting Widget",
      description: "Displays greeting messages",
      html: "./src/ui/dist/index.html",
      prefersBorder: true,
    },
  },

  config: {
    cors: {
      origin: true,
    },
    protocol: "mcp",

    // OAuth 2.1 Configuration (Uncomment and configure with your values)
  //   oauth: {
  //     // Public URL of this MCP server (the Protected Resource)
  //     protectedResource: "http://localhost:3000",
    
  //     // Issuer URL of your OAuth 2.1 Authorization Server
  //     // Replace with your actual Authorization Server URL
  //     // Examples: "https://accounts.google.com", "https://your-auth0-domain.auth0.com"
  //     authorizationServer: "https://auth.example.com",
    
  //     // Optional: Required OAuth scopes for all requests
  //     // Tokens must contain ALL listed scopes
  //     scopes: ["mcp:read"],
    
  //     // Optional: Explicit JWKS URI (auto-discovered if not provided)
  //     // jwksUri: "https://auth.example.com/.well-known/jwks.json",
    
  //     // Optional: Allowed JWT signing algorithms (defaults to ["RS256"])
  //     // algorithms: ["RS256", "RS384", "ES256"],
    
  //     // Optional: Expected audience (defaults to protectedResource)
  //     // audience: "https://api.example.com",
    
  //     // Optional: Custom token verification (for token introspection, non-JWT tokens)
  //     // tokenVerifier: {
  //     //   async verifyAccessToken(token: string) {
  //     //     const res = await fetch("https://auth.example.com/introspect", {
  //     //       method: "POST",
  //     //       body: new URLSearchParams({ token }),
  //     //     });
  //     //     const data = await res.json();
  //     //     if (!data.active) throw new Error("Token inactive");
  //     //     return {
  //     //       token,
  //     //       clientId: data.client_id,
  //     //       scopes: data.scope.split(" "),
  //     //       expiresAt: data.exp,
  //     //       extra: { subject: data.sub },
  //     //     };
  //     //   },
  //     // },
  //   },
   },
});

const port = parseInt(process.env.PORT || "3000");

app.start({ port }).then(() => {
  console.log(`
Minimal Example Server running on http://localhost:${port}
MCP endpoint: http://localhost:${port}/mcp
Health check: http://localhost:${port}/health
  `);
});
