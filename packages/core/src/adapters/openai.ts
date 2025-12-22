/**
 * OpenAI Protocol Adapter
 *
 * Handles metadata generation for OpenAI/ChatGPT Apps protocol.
 * Uses snake_case naming and openai/* prefixed keys.
 */

import type { ToolDef, ToolAnnotations } from "../types/tools";
import type { UIDef } from "../types/ui";
import type { ProtocolAdapter, ToolMetaResult, UIResourceMetaResult } from "./types";
import { mapVisibilityToOpenAI } from "../utils/metadata";
import { generateOpenAICSPMetadata } from "../utils/csp";

// =============================================================================
// OPENAI ADAPTER
// =============================================================================

/**
 * OpenAI protocol adapter implementation
 *
 * Generates metadata in OpenAI/ChatGPT Apps format:
 * - Visibility as openai/visibility ("public"/"private") + openai/widgetAccessible
 * - Metadata with openai/* prefixed keys
 * - MIME type: text/html+skybridge
 * - CSP with snake_case keys (connect_domains, resource_domains, etc.)
 * - Supports invokingMessage, invokedMessage, widgetAccessible
 */
export class OpenAIAdapter implements ProtocolAdapter {
  /**
   * Build tool metadata for OpenAI protocol
   */
  buildToolMeta(toolDef: ToolDef, _serverName: string, uiUri?: string): ToolMetaResult {
    const meta: Record<string, unknown> = {};

    // Add visibility settings with openai/ prefixes
    const visibilitySettings = mapVisibilityToOpenAI(toolDef.visibility);
    Object.assign(meta, visibilitySettings);

    // Allow explicit widgetAccessible to override visibility-derived value
    if (toolDef.widgetAccessible !== undefined) {
      meta["openai/widgetAccessible"] = toolDef.widgetAccessible;
    }

    // Add UI binding with OpenAI prefix (use pre-computed URI with cache-busting hash)
    if (uiUri) {
      meta["openai/outputTemplate"] = uiUri;
    }

    // Add invoking/invoked messages (ChatGPT-specific)
    if (toolDef.invokingMessage) {
      meta["openai/toolInvocation/invoking"] = toolDef.invokingMessage;
    }
    if (toolDef.invokedMessage) {
      meta["openai/toolInvocation/invoked"] = toolDef.invokedMessage;
    }

    // Add file parameters (ChatGPT-specific)
    if (toolDef.fileParams && toolDef.fileParams.length > 0) {
      meta["openai/fileParams"] = toolDef.fileParams;
    }

    // Build annotations if specified
    const annotations = this.buildAnnotations(toolDef.annotations);

    return {
      annotations,
      _meta: Object.keys(meta).length > 0 ? meta : undefined,
    };
  }

  /**
   * Build OpenAI annotations from tool annotations
   *
   * OpenAI uses the same annotation names as MCP spec
   */
  private buildAnnotations(annotations?: ToolAnnotations): Record<string, unknown> | undefined {
    if (!annotations) {
      return undefined;
    }

    const result: Record<string, unknown> = {};

    if (annotations.readOnlyHint !== undefined) {
      result.readOnlyHint = annotations.readOnlyHint;
    }
    if (annotations.destructiveHint !== undefined) {
      result.destructiveHint = annotations.destructiveHint;
    }
    if (annotations.openWorldHint !== undefined) {
      result.openWorldHint = annotations.openWorldHint;
    }
    if (annotations.idempotentHint !== undefined) {
      result.idempotentHint = annotations.idempotentHint;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Build UI resource metadata for OpenAI protocol
   */
  buildUIResourceMeta(uiDef: UIDef): UIResourceMetaResult {
    const meta: Record<string, unknown> = {};

    // Add CSP metadata with openai/ prefix
    if (uiDef.csp) {
      const cspMetadata = generateOpenAICSPMetadata(uiDef.csp);
      if (Object.keys(cspMetadata).length > 0) {
        meta["openai/widgetCSP"] = cspMetadata;
      }
    }

    // Add prefersBorder with openai/ prefix
    if (uiDef.prefersBorder !== undefined) {
      meta["openai/widgetPrefersBorder"] = uiDef.prefersBorder;
    }

    // Add domain with openai/ prefix
    if (uiDef.domain) {
      meta["openai/widgetDomain"] = uiDef.domain;
    }

    // Add widget description for model understanding
    if (uiDef.widgetDescription) {
      meta["openai/widgetDescription"] = uiDef.widgetDescription;
    }

    const result: UIResourceMetaResult = {
      mimeType: "text/html+skybridge",
    };

    if (Object.keys(meta).length > 0) {
      result._meta = meta;
    }

    return result;
  }
}
