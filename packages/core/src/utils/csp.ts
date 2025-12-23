/**
 * CSP (Content Security Policy) utilities
 *
 * Provides utilities for mapping CSP configuration to protocol-specific formats
 * for MCP Apps and ChatGPT Apps.
 */

import type { CSPConfig } from "../types/ui";

// =============================================================================
// MCP CSP METADATA
// =============================================================================

/**
 * MCP CSP metadata format
 *
 * MCP Apps use camelCase field names.
 */
export interface McpCSPMetadata {
  connectDomains?: string[];
  resourceDomains?: string[];
}

/**
 * Generate CSP metadata for MCP Apps protocol
 *
 * MCP Apps only supports connectDomains and resourceDomains.
 * ChatGPT-only fields are ignored.
 *
 * @param csp - CSP configuration
 * @returns MCP-specific CSP metadata
 */
export function generateMcpCSPMetadata(csp: CSPConfig): McpCSPMetadata {
  const result: McpCSPMetadata = {};

  if (csp.connectDomains && csp.connectDomains.length > 0) {
    result.connectDomains = csp.connectDomains;
  }

  if (csp.resourceDomains && csp.resourceDomains.length > 0) {
    result.resourceDomains = csp.resourceDomains;
  }

  return result;
}

// =============================================================================
// OPENAI CSP METADATA
// =============================================================================

/**
 * OpenAI CSP metadata format
 *
 * ChatGPT Apps use snake_case field names.
 */
export interface OpenAICSPMetadata {
  connect_domains?: string[];
  resource_domains?: string[];
  redirect_domains?: string[];
  frame_domains?: string[];
}

/**
 * Generate CSP metadata for OpenAI/ChatGPT Apps protocol
 *
 * ChatGPT Apps support all CSP fields including redirect and frame domains.
 *
 * @param csp - CSP configuration
 * @returns OpenAI-specific CSP metadata
 */
export function generateOpenAICSPMetadata(csp: CSPConfig): OpenAICSPMetadata {
  const result: OpenAICSPMetadata = {};

  if (csp.connectDomains && csp.connectDomains.length > 0) {
    result.connect_domains = csp.connectDomains;
  }

  if (csp.resourceDomains && csp.resourceDomains.length > 0) {
    result.resource_domains = csp.resourceDomains;
  }

  if (csp.redirectDomains && csp.redirectDomains.length > 0) {
    result.redirect_domains = csp.redirectDomains;
  }

  if (csp.frameDomains && csp.frameDomains.length > 0) {
    result.frame_domains = csp.frameDomains;
  }

  return result;
}

// =============================================================================
// UI RESOURCE METADATA GENERATION
// =============================================================================

import type { UIDef } from "../types/ui";

/**
 * MCP UI resource metadata format
 */
export interface McpUIResourceMetadata {
  name?: string;
  description?: string;
  html: string;
  csp?: McpCSPMetadata;
  prefersBorder?: boolean;
}

/**
 * OpenAI UI resource metadata format
 */
export interface OpenAIUIResourceMetadata {
  name?: string;
  description?: string;
  html: string;
  "openai/widgetCSP"?: OpenAICSPMetadata;
  prefersBorder?: boolean;
  domain?: string;
}

/**
 * Generate UI resource metadata for MCP protocol
 *
 * @param key - Resource identifier
 * @param uiDef - UI resource definition
 * @returns MCP-specific UI resource metadata
 */
export function generateMcpUIMetadata(key: string, uiDef: UIDef): McpUIResourceMetadata {
  const result: McpUIResourceMetadata = {
    name: uiDef.name ?? key,
    html: uiDef.html,
  };

  if (uiDef.description) {
    result.description = uiDef.description;
  }

  if (uiDef.csp) {
    const cspMetadata = generateMcpCSPMetadata(uiDef.csp);
    if (Object.keys(cspMetadata).length > 0) {
      result.csp = cspMetadata;
    }
  }

  if (uiDef.prefersBorder !== undefined) {
    result.prefersBorder = uiDef.prefersBorder;
  }

  return result;
}

/**
 * Generate UI resource metadata for OpenAI protocol
 *
 * @param key - Resource identifier
 * @param uiDef - UI resource definition
 * @returns OpenAI-specific UI resource metadata
 */
export function generateOpenAIUIMetadata(key: string, uiDef: UIDef): OpenAIUIResourceMetadata {
  const result: OpenAIUIResourceMetadata = {
    name: uiDef.name ?? key,
    html: uiDef.html,
  };

  if (uiDef.description) {
    result.description = uiDef.description;
  }

  if (uiDef.csp) {
    const cspMetadata = generateOpenAICSPMetadata(uiDef.csp);
    if (Object.keys(cspMetadata).length > 0) {
      result["openai/widgetCSP"] = cspMetadata;
    }
  }

  if (uiDef.prefersBorder !== undefined) {
    result.prefersBorder = uiDef.prefersBorder;
  }

  if (uiDef.domain) {
    result.domain = uiDef.domain;
  }

  return result;
}
