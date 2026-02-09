/**
 * executePrimitive — frontend utility to call POST /api/execute-primitive
 * and map the backend response into ExecutionResult for the PrimitiveDetail component.
 *
 * Three per-kind mapper functions (mapToolResponse, mapResourceResponse, mapPromptResponse)
 * never throw; they always return an ExecutionResult.
 */

import type {
  ExecutionResult,
  ExecuteFn,
  ContentBlock,
  ResourceContent,
  PromptMessage,
  ExecutionMeta,
  Primitive,
} from "../components/PrimitiveDetail";

// =============================================================================
// Helpers
// =============================================================================

/** Safely get a property from an unknown value */
function getProp(obj: unknown, key: string): unknown {
  if (obj !== null && typeof obj === "object" && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Check if a value is a non-null object */
function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// =============================================================================
// Per-kind mapper functions
// =============================================================================

/**
 * Map a tool call response from the backend into ExecutionResult.
 * Backend shape (MCP callTool): { content: ContentBlock[], isError?: boolean, structuredContent?: unknown, _meta?: object }
 */
export function mapToolResponse(data: unknown): ExecutionResult {
  if (!isObj(data)) {
    return { ok: true, content: [], _meta: {} };
  }

  const isError = getProp(data, "isError") === true;

  // Map content array
  const rawContent = getProp(data, "content");
  const content: ContentBlock[] = [];
  if (Array.isArray(rawContent)) {
    for (const item of rawContent) {
      if (isObj(item)) {
        content.push({
          type: typeof item.type === "string" ? item.type : "text",
          text: typeof item.text === "string" ? item.text : undefined,
          data: typeof item.data === "string" ? item.data : undefined,
          mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        });
      }
    }
  }

  // Extract error message from content if isError
  let errorMsg: string | undefined;
  if (isError) {
    const firstText = content.find((b) => b.type === "text" && b.text);
    errorMsg = firstText?.text ?? "Tool execution returned an error";
  }

  // Map structured content
  const structuredContent = getProp(data, "structuredContent");

  // Build _meta
  const rawMeta = getProp(data, "_meta");
  const meta: ExecutionMeta = isObj(rawMeta) ? { ...(rawMeta as ExecutionMeta) } : {};

  return {
    ok: !isError,
    error: errorMsg,
    content,
    structuredContent,
    _meta: meta,
  };
}

/**
 * Map a resource read response from the backend into ExecutionResult.
 * Backend shape (MCP readResource): { contents: Array<{ uri, mimeType?, text?, blob? }>, _meta?: object }
 */
export function mapResourceResponse(data: unknown): ExecutionResult {
  if (!isObj(data)) {
    return { ok: true, contents: [], _meta: {} };
  }

  const rawContents = getProp(data, "contents");
  const contents: ResourceContent[] = [];
  if (Array.isArray(rawContents)) {
    for (const item of rawContents) {
      if (isObj(item)) {
        contents.push({
          uri: typeof item.uri === "string" ? item.uri : "",
          mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
          text: typeof item.text === "string" ? item.text : undefined,
          blob: typeof item.blob === "string" ? item.blob : undefined,
        });
      }
    }
  }

  const rawMeta = getProp(data, "_meta");
  const meta: ExecutionMeta = isObj(rawMeta) ? { ...(rawMeta as ExecutionMeta) } : {};

  return {
    ok: true,
    contents,
    _meta: meta,
  };
}

/**
 * Map a prompt get response from the backend into ExecutionResult.
 * Backend shape (MCP getPrompt): { messages: Array<{ role, content }>, _meta?: object }
 */
export function mapPromptResponse(data: unknown, promptName: string): ExecutionResult {
  if (!isObj(data)) {
    return { ok: true, messages: [], _meta: { promptName } };
  }

  const rawMessages = getProp(data, "messages");
  const messages: PromptMessage[] = [];
  if (Array.isArray(rawMessages)) {
    for (const item of rawMessages) {
      if (isObj(item)) {
        const role = item.role === "assistant" ? "assistant" : "user";
        const rawMsgContent = item.content;
        let content: string | ContentBlock[];
        if (typeof rawMsgContent === "string") {
          content = rawMsgContent;
        } else if (Array.isArray(rawMsgContent)) {
          content = rawMsgContent.map((block: unknown) => {
            if (isObj(block)) {
              return {
                type: typeof block.type === "string" ? block.type : "text",
                text: typeof block.text === "string" ? block.text : undefined,
                data: typeof block.data === "string" ? block.data : undefined,
                mimeType: typeof block.mimeType === "string" ? block.mimeType : undefined,
              } as ContentBlock;
            }
            return { type: "text", text: String(block) } as ContentBlock;
          });
        } else if (rawMsgContent === null || rawMsgContent === undefined) {
          content = "";
        } else if (typeof rawMsgContent === "number" || typeof rawMsgContent === "boolean") {
          content = String(rawMsgContent);
        } else {
          content = JSON.stringify(rawMsgContent);
        }
        messages.push({ role, content });
      }
    }
  }

  const rawMeta = getProp(data, "_meta");
  const meta: ExecutionMeta = isObj(rawMeta)
    ? { ...(rawMeta as ExecutionMeta), promptName }
    : { promptName };

  return {
    ok: true,
    messages,
    _meta: meta,
  };
}

// =============================================================================
// Main executePrimitive function
// =============================================================================

/** Backend response shape from POST /api/execute-primitive */
interface BackendResponse {
  ok: boolean;
  kind: string;
  data: unknown;
  error?: string;
  duration_ms: number;
}

/**
 * Execute a primitive via POST /api/execute-primitive and return an ExecutionResult.
 */
export async function executePrimitive(
  baseUrl: string,
  connectionId: string,
  primitive: Primitive,
  params: Record<string, unknown>
): Promise<ExecutionResult> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/execute-primitive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId,
        kind: primitive.kind,
        name: primitive.name,
        params,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${message}` };
  }

  let body: BackendResponse;
  try {
    body = (await response.json()) as BackendResponse;
  } catch {
    return { ok: false, error: `Invalid response (status ${String(response.status)})` };
  }

  if (!response.ok || !body.ok) {
    const errorMsg = body.error ?? `Server error (status ${String(response.status)})`;
    return {
      ok: false,
      error: errorMsg,
      _meta: { duration_ms: body.duration_ms },
    };
  }

  // Dispatch to the correct mapper based on kind
  let result: ExecutionResult;
  switch (primitive.kind) {
    case "tool":
      result = mapToolResponse(body.data);
      break;
    case "resource":
      result = mapResourceResponse(body.data);
      break;
    case "prompt":
      result = mapPromptResponse(body.data, primitive.name);
      break;
    default:
      return {
        ok: false,
        error: `Unknown primitive kind: ${(primitive as { kind: string }).kind}`,
      };
  }

  // Attach duration from backend response
  if (result._meta) {
    result._meta.duration_ms = body.duration_ms;
  } else {
    result._meta = { duration_ms: body.duration_ms };
  }

  return result;
}

// =============================================================================
// ExecuteFn wrapper (curried with connectionId)
// =============================================================================

/**
 * Create an ExecuteFn bound to a specific connectionId.
 * This is the function passed as `onExecute` prop to PrimitiveDetail.
 */
export function createExecuteFn(baseUrl: string, connectionId: string): ExecuteFn {
  return (primitive: Primitive, params: Record<string, unknown>) =>
    executePrimitive(baseUrl, connectionId, primitive, params);
}
