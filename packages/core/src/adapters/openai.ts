/**
 * OpenAI Protocol Adapter
 *
 * Handles metadata generation for OpenAI/ChatGPT Apps protocol.
 * Uses snake_case naming and openai/* prefixed keys.
 */

import type { ToolDef } from "../types/tools";
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
  buildToolMeta(toolDef: ToolDef, serverName: string): ToolMetaResult {
    const meta: Record<string, unknown> = {};

    // Add visibility settings with openai/ prefixes
    const visibilitySettings = mapVisibilityToOpenAI(toolDef.visibility);
    Object.assign(meta, visibilitySettings);

    // Allow explicit widgetAccessible to override visibility-derived value
    if (toolDef.widgetAccessible !== undefined) {
      meta["openai/widgetAccessible"] = toolDef.widgetAccessible;
    }

    // Add UI binding with OpenAI prefix - use full resource URI
    if (toolDef.ui) {
      meta["openai/outputTemplate"] = `ui://${serverName}/${toolDef.ui}`;
    }

    // Add invoking/invoked messages (ChatGPT-specific)
    if (toolDef.invokingMessage) {
      meta["openai/toolInvocation/invoking"] = toolDef.invokingMessage;
    }
    if (toolDef.invokedMessage) {
      meta["openai/toolInvocation/invoked"] = toolDef.invokedMessage;
    }

    return {
      _meta: Object.keys(meta).length > 0 ? meta : undefined,
    };
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

    const result: UIResourceMetaResult = {
      mimeType: "text/html+skybridge",
    };

    if (Object.keys(meta).length > 0) {
      result._meta = meta;
    }

    return result;
  }
}
