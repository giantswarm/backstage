import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';

/**
 * Provider label matching the values reported in the /chat debug metadata and
 * used to describe which AI-SDK provider a model was built from.
 */
export type ProviderName =
  'anthropic' | 'google-vertex' | 'azure' | 'openai-compatible' | 'openai';

/**
 * Resolved AI chat provider configuration, as read from `aiChat.*`. Kept as a
 * plain value object (rather than a Backstage `Config`) so provider selection
 * is a pure, dependency-free function that can be unit tested offline.
 */
export interface SelectModelOptions {
  /** `aiChat.model` — drives which provider branch is selected. */
  modelName: string;
  openai: {
    apiKey?: string;
    baseUrl?: string;
    /** `aiChat.openai.api`: `chat` routes through @ai-sdk/openai-compatible. */
    api: 'chat' | 'responses';
  };
  anthropic: {
    apiKey?: string;
    baseUrl?: string;
  };
  azure: {
    apiKey?: string;
    resourceName?: string;
    baseUrl?: string;
    apiVersion?: string;
  };
  google: {
    project?: string;
    location?: string;
    keyFilename?: string;
  };
  /**
   * `aiChat.sampling.minP` — not part of the SDK CallSettings, spliced into the
   * openai-compatible request body via `transformRequestBody`.
   */
  samplingMinP?: number;
  /**
   * Test seam: a custom `fetch` forwarded to every provider factory. Lets unit
   * tests drive model resolution through `streamText` with no real network.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Test seam: forwarded to `createVertex`'s `googleAuthOptions`. Passing a stub
   * auth client here keeps the Vertex branch offline (no service-account read,
   * no token minting). When omitted, the mounted service-account JSON at
   * `google.keyFilename` is used, matching production.
   */
  googleAuthOptions?: Record<string, unknown>;
}

export interface SelectedModel {
  model: LanguageModel;
  providerName: ProviderName;
}

/**
 * Determine whether the Azure OpenAI branch is usable. Azure needs an API key
 * plus either a resource name or an explicit base URL.
 */
export function isAzureConfigured(azure: SelectModelOptions['azure']): boolean {
  return !!(azure.apiKey && (azure.resourceName || azure.baseUrl));
}

/**
 * Build the AI-SDK language model for the configured `aiChat.model` and report
 * which provider it came from.
 *
 * Provider precedence (kept identical to the /chat handler):
 *   `claude-*`  -> Anthropic
 *   `gemini-*`  -> Google Vertex (ahead of the Azure/OpenAI chain so a gemini
 *                  model isn't swallowed by an Azure configuration)
 *   otherwise   -> Azure (if configured) / openai-compatible (`openai.api: chat`)
 *                  / OpenAI
 *
 * This is a pure function so the exact `ai` core + `@ai-sdk/*` provider
 * resolution path that `streamText` exercises can be unit tested offline — the
 * spec-version mismatch that broke #1926 throws during that resolution, before
 * any HTTP request.
 */
export function selectModel(options: SelectModelOptions): SelectedModel {
  const { modelName, fetch } = options;
  const isAnthropicModel = modelName.startsWith('claude-');
  const isGoogleModel = modelName.startsWith('gemini-');

  if (isAnthropicModel) {
    const anthropic = createAnthropic({
      apiKey: options.anthropic.apiKey,
      baseURL: options.anthropic.baseUrl,
      fetch,
    });
    return { model: anthropic(modelName), providerName: 'anthropic' };
  }

  if (isGoogleModel) {
    // Vertex is not authenticated with a static API key: `@ai-sdk/google-vertex`
    // uses google-auth-library to read the mounted service-account JSON and mint
    // short-lived OAuth2 tokens.
    const vertex = createVertex({
      project: options.google.project,
      location: options.google.location,
      googleAuthOptions:
        options.googleAuthOptions ??
        (options.google.keyFilename
          ? { keyFilename: options.google.keyFilename }
          : undefined),
      fetch,
    });
    return { model: vertex(modelName), providerName: 'google-vertex' };
  }

  if (isAzureConfigured(options.azure)) {
    const azure = createAzure({
      apiKey: options.azure.apiKey,
      resourceName: options.azure.resourceName,
      baseURL: options.azure.baseUrl,
      apiVersion: options.azure.apiVersion,
      useDeploymentBasedUrls: true,
      fetch,
    });
    return { model: azure.chat(modelName), providerName: 'azure' };
  }

  if (options.openai.api === 'chat') {
    // Use @ai-sdk/openai-compatible for vLLM-style chat-completions servers so
    // reasoning chunks are surfaced and token usage is included in the stream.
    const openaiCompatible = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: options.openai.baseUrl ?? '',
      apiKey: options.openai.apiKey,
      includeUsage: true,
      // `min_p` is not part of the AI SDK CallSettings, but vLLM accepts it as a
      // top-level field on `/v1/chat/completions`.
      transformRequestBody:
        options.samplingMinP !== undefined
          ? args => ({ ...args, min_p: options.samplingMinP })
          : undefined,
      fetch,
    });
    return {
      model: openaiCompatible.chatModel(modelName),
      providerName: 'openai-compatible',
    };
  }

  const openai = createOpenAI({
    apiKey: options.openai.apiKey,
    baseURL: options.openai.baseUrl,
    fetch,
  });
  return { model: openai(modelName), providerName: 'openai' };
}
