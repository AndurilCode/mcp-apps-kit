# ChatGPT Apps Builder Skill

Comprehensive guide for implementing ChatGPT Apps using the OpenAI Apps SDK.

## What is this skill?

This skill provides detailed, actionable guidance for building MCP (Model Context Protocol) servers that integrate with ChatGPT's widget runtime, enabling rich interactive UI experiences within ChatGPT conversations.

## When to use this skill

- Building MCP servers specifically for ChatGPT integration
- Creating interactive widgets that render inside ChatGPT
- Implementing OAuth 2.1 authentication for ChatGPT apps
- Managing widget state and bidirectional server communication
- Deploying and submitting apps to the ChatGPT platform

## Structure

### Main Skill Document

**[SKILL.md](./SKILL.md)** - The primary skill document containing:
- Complete implementation workflow from setup to deployment
- Step-by-step instructions for MCP server and widget development
- Authentication and authorization patterns
- Advanced features (file handling, display modes, navigation)
- Security best practices
- Troubleshooting guide
- Quick reference tables

### Reference Documents

**[references/window-openai-api.md](./references/window-openai-api.md)**
- Complete API reference for `window.openai` runtime
- All properties, methods, and events
- TypeScript definitions
- Usage examples and patterns

**[references/oauth-authentication.md](./references/oauth-authentication.md)**
- OAuth 2.1 implementation guide
- Protected resource metadata setup
- Authorization server configuration
- Token verification patterns
- PKCE implementation details
- Identity provider guides (Auth0, Stytch)

**[references/best-practices.md](./references/best-practices.md)**
- Proven patterns and anti-patterns
- Data architecture strategies
- UI/UX patterns
- Performance optimization techniques
- Security patterns
- Testing strategies
- Common pitfalls and solutions

## Key Differences from MCP Apps (SEP-1865)

This skill covers **OpenAI Apps SDK** for ChatGPT, which differs from the general MCP Apps (SEP-1865) covered in the `mcp-mcp-apps-kit` skill:

| Feature | ChatGPT Apps SDK | MCP Apps (SEP-1865) |
|---------|------------------|---------------------|
| **MIME Type** | `text/html+skybridge` | `text/html;profile=mcp-app` |
| **Widget Runtime** | `window.openai` | `window.app` (PostMessage transport) |
| **Host** | ChatGPT only | Claude Desktop, ChatGPT, others |
| **Template Format** | Inline HTML in MCP resource | Single HTML file with bundled assets |
| **Metadata Keys** | `openai/*` prefix | Generic MCP metadata |
| **CSP Config** | `openai/widgetCSP` | Standard `_meta.ui.csp` |
| **Authentication** | OAuth 2.1 with DCR | OAuth 2.1 with DCR |
| **State Management** | `window.openai.setWidgetState` | App-managed via PostMessage |

**Use this skill (chatgpt-mcp-apps-kit) when:**
- Targeting ChatGPT specifically
- Building with OpenAI Apps SDK patterns
- Following ChatGPT app submission guidelines

**Use mcp-mcp-apps-kit when:**
- Targeting Claude Desktop or multi-host compatibility
- Following SEP-1865 specification
- Using `@modelcontextprotocol/ext-apps` package

## Quick Start

1. Read [SKILL.md](./SKILL.md) for complete workflow
2. Reference [window-openai-api.md](./references/window-openai-api.md) while building widget
3. Implement auth using [oauth-authentication.md](./references/oauth-authentication.md) if needed
4. Follow patterns in [best-practices.md](./references/best-practices.md)

## Example Flow

```
1. Set up project structure (server/ + web/)
2. Install dependencies (@modelcontextprotocol/sdk, React)
3. Build widget (React component using window.openai)
4. Bundle widget (Vite/esbuild → single HTML)
5. Register widget as MCP resource (text/html+skybridge)
6. Define tools pointing to widget
7. Implement tool handlers (return structuredContent + _meta)
8. Configure CSP (openai/widgetCSP)
9. Add authentication if needed (OAuth 2.1)
10. Test with MCP Inspector
11. Deploy to HTTPS endpoint
12. Submit to ChatGPT
```

## Additional Resources

**Official Documentation:**
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk)
- [Apps SDK Quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [MCP Specification](https://modelcontextprotocol.io/specification)

**Examples:**
- [Apps SDK Examples Repository](https://github.com/openai/openai-apps-sdk-examples)
- [Apps SDK UI Kit](https://openai.github.io/apps-sdk-ui)

**Tools:**
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Related Skills

- **mcp-builder** - General MCP server implementation
- **mcp-mcp-apps-kit** - MCP Apps (SEP-1865) for Claude Desktop

---

**Maintained by:** thefork-app-mcp project  
**Last Updated:** December 2024
