import {
  HttpAuthService,
  LoggerService,
  resolvePackagePath,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import {
  convertToModelMessages,
  streamText,
  ToolSet,
  UIMessage,
  SystemModelMessage,
} from 'ai';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { readFileSync } from 'fs';
import { getMcpTools } from './getMcpTools';
import { McpClientCache } from './McpClientCache';
import { frontendTools } from './frontendTools';
import {
  listSkills,
  getSkill,
  createUserTools,
  createResourceTools,
  createContextUsageTool,
  recordUsage,
} from './tools';
import {
  extractMcpAuthTokens,
  deduplicateToolCallIds,
  sanitizeMessages,
} from './utils';

const systemPromptPath = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'systemPrompt.md',
);
const defaultSystemPrompt = readFileSync(systemPromptPath, 'utf-8');

const musterPromptPath = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'systemPromptMuster.md',
);
const musterSystemPrompt = readFileSync(musterPromptPath, 'utf-8');

export interface RouterOptions {
  httpAuth: HttpAuthService;
  logger: LoggerService;
  config: Config;
  userInfo: UserInfoService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, logger, config, userInfo } = options;

  const mcpClientCache = new McpClientCache(logger);

  const router = Router();
  router.use(express.json({ limit: '2mb' }));

  // Resolve base system prompt: config override wins over the bundled file.
  const configuredSystemPrompt = config
    .getOptionalString('aiChat.systemPrompt')
    ?.trim();
  const baseSystemPrompt = configuredSystemPrompt || defaultSystemPrompt;
  if (configuredSystemPrompt) {
    logger.info('Using system prompt override from config');
  }

  // Get model configuration
  const modelName = config.getOptionalString('aiChat.model') ?? 'gpt-4o-mini';

  // Get OpenAI configuration
  const openaiApiKey = config.getOptionalString('aiChat.openai.apiKey');
  const openaiBaseUrl = config.getOptionalString('aiChat.openai.baseUrl');

  // Get Anthropic configuration
  const anthropicApiKey = config.getOptionalString('aiChat.anthropic.apiKey');
  const anthropicBaseUrl = config.getOptionalString('aiChat.anthropic.baseUrl');

  // Get Azure OpenAI configuration
  const azureApiKey = config.getOptionalString('aiChat.azure.apiKey');
  const azureResourceName = config.getOptionalString(
    'aiChat.azure.resourceName',
  );
  const azureBaseUrl = config.getOptionalString('aiChat.azure.baseUrl');
  const azureApiVersion = config.getOptionalString('aiChat.azure.apiVersion');
  const isAzureConfigured = !!(
    azureApiKey &&
    (azureResourceName || azureBaseUrl)
  );

  // Determine which provider to use based on model name
  const isAnthropicModel = modelName.startsWith('claude-');

  // Validate configuration
  if (isAnthropicModel && !anthropicApiKey) {
    logger.warn(
      'No Anthropic API key configured for Anthropic model. Set aiChat.anthropic.apiKey in app-config.yaml',
    );
  }

  if (!isAnthropicModel && isAzureConfigured && !azureApiKey) {
    logger.warn(
      'Azure OpenAI configured but no API key set. Set aiChat.azure.apiKey in app-config.yaml',
    );
  }

  if (!isAnthropicModel && !isAzureConfigured && !openaiApiKey) {
    logger.warn(
      'No OpenAI API key configured for OpenAI model. Set aiChat.openai.apiKey in app-config.yaml',
    );
  }

  // Create provider clients
  const openai = createOpenAI({
    apiKey: openaiApiKey,
    baseURL: openaiBaseUrl,
  });

  const anthropic = createAnthropic({
    apiKey: anthropicApiKey,
    baseURL: anthropicBaseUrl,
  });

  const azure = createAzure({
    apiKey: azureApiKey,
    resourceName: azureResourceName,
    baseURL: azureBaseUrl,
    apiVersion: azureApiVersion,
    useDeploymentBasedUrls: true,
  });

  router.post('/chat', async (req, res) => {
    // Verify user is authenticated
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;
    const rawConversationId = req.headers['x-conversation-id'] as
      | string
      | undefined;
    const conversationId =
      rawConversationId && rawConversationId.length <= 64
        ? rawConversationId
        : undefined;
    const requestId = crypto.randomUUID();

    const chatLogger = logger.child({
      ...(conversationId && { conversationId }),
      userRef,
    });
    chatLogger.info('Chat request received');

    // Schema for chat request
    const chatRequestSchema = z.object({
      messages: z.array(z.any()),
      tools: z.any().optional(),
    });
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(`Invalid request body: ${parsed.error.message}`);
    }

    const { messages, tools } = parsed.data;

    const authTokens = extractMcpAuthTokens(req.headers);

    const {
      tools: mcpTools,
      resources: mcpResources,
      failedServers,
      connectedServers,
    } = await getMcpTools(config, authTokens, chatLogger, mcpClientCache);
    chatLogger.debug(`MCP tools available: ${Object.keys(mcpTools).length}`);
    chatLogger.debug(`MCP tool names: ${Object.keys(mcpTools).join(', ')}`);
    if (failedServers.length > 0) {
      chatLogger.warn(
        `${failedServers.length} MCP server(s) failed to connect: ${failedServers.map(s => s.name).join(', ')}`,
      );
    }

    // User-scoped tools that need access to the current request's credentials
    const userTools = createUserTools(userInfo, credentials);

    // Context usage tool (scoped to user and conversation)
    const contextUsageTools = createContextUsageTool(userRef, conversationId);

    // MCP resource tools
    const mcpResourceTools = createResourceTools(mcpResources);

    // Build effective system prompt, including MCP-specific sections as needed
    let effectiveSystemPrompt = baseSystemPrompt;
    if (connectedServers.includes('muster')) {
      effectiveSystemPrompt += `\n\n${musterSystemPrompt}`;
    }
    if (failedServers.length > 0) {
      const failureNote = `\n\n---\n**Note:** The following MCP tool server(s) are currently unavailable: ${failedServers.map(s => s.name).join(', ')}. Some tools may not be available. If the user asks about functionality that requires these servers, let them know there's a connectivity issue.`;
      effectiveSystemPrompt += failureNote;
    }

    try {
      // Select the appropriate provider based on model type
      // When Azure is configured, non-Anthropic models route through Azure
      const openaiCompatibleModel = isAzureConfigured
        ? azure.chat(modelName)
        : openai(modelName);
      const selectedModel = isAnthropicModel
        ? anthropic(modelName)
        : openaiCompatibleModel;

      // Convert UI messages to model messages
      const modelMessages = await convertToModelMessages(
        messages as UIMessage[],
      );

      // Deduplicate tool call IDs to prevent Anthropic API errors
      const deduplicatedMessages = deduplicateToolCallIds(modelMessages);

      // Strip unsupported file/image parts (e.g. pasted screenshots)
      // to prevent "URL scheme must be http or https" errors from the AI SDK
      const { messages: sanitizedMessages, hadUnsupportedContent } =
        sanitizeMessages(deduplicatedMessages);
      if (hadUnsupportedContent) {
        chatLogger.info('Removed unsupported file/image content from messages');
      }

      // For Anthropic models, prepend system message with cache control
      // to enable prompt caching for the system prompt.
      // See: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control
      const systemMessage: SystemModelMessage | undefined = isAnthropicModel
        ? {
            role: 'system',
            content: effectiveSystemPrompt,
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          }
        : undefined;

      chatLogger.debug('Sending messages to API', {
        messageCount: deduplicatedMessages.length,
      });

      const result = streamText({
        model: selectedModel as any,
        messages: systemMessage
          ? [systemMessage, ...sanitizedMessages]
          : sanitizedMessages,
        system: isAnthropicModel ? undefined : effectiveSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
        tools: {
          ...frontendTools(tools),
          ...mcpTools,
          ...mcpResourceTools,
          // Skill tools
          listSkills,
          getSkill,
          // User tools (request-scoped)
          ...userTools,
          // Context usage tool
          ...contextUsageTools,
        } as ToolSet,
        providerOptions: isAnthropicModel
          ? {
              anthropic: {
                thinking: { type: 'enabled', budgetTokens: 10000 },
              },
            }
          : undefined,
        onError({ error }) {
          chatLogger.error('Error during streaming:', error as Error);
        },
        onStepFinish({ usage, finishReason, toolCalls }) {
          const cumulative = recordUsage(
            userRef,
            usage,
            modelName,
            conversationId,
            requestId,
          );
          chatLogger.debug('Step finished', {
            finishReason,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            toolCalls: toolCalls.map(tc => tc.toolName),
            cumulativeInputTokens: cumulative.cumulativeInputTokens,
            cumulativeOutputTokens: cumulative.cumulativeOutputTokens,
          });
        },
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      result.pipeUIMessageStreamToResponse(res);
    } catch (error) {
      chatLogger.error('Error in chat endpoint', error as Error);
      throw error;
    }
  });

  // Health check endpoint
  router.get('/health', (_, res) => {
    const openaiCompatibleProvider = isAzureConfigured
      ? 'azure-openai'
      : 'openai';
    const openaiCompatibleConfigured = isAzureConfigured
      ? !!azureApiKey
      : !!openaiApiKey;

    res.json({
      status: 'ok',
      model: modelName,
      provider: isAnthropicModel ? 'anthropic' : openaiCompatibleProvider,
      configured: isAnthropicModel
        ? !!anthropicApiKey
        : openaiCompatibleConfigured,
      openaiConfigured: !!openaiApiKey,
      anthropicConfigured: !!anthropicApiKey,
      azureConfigured: isAzureConfigured,
    });
  });

  return router;
}
