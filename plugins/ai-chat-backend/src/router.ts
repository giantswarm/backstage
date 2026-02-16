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
import {
  convertToModelMessages,
  streamText,
  ToolSet,
  UIMessage,
  SystemModelMessage,
} from 'ai';
import { z } from 'zod';
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
} from './tools';
import { extractMcpAuthTokens, deduplicateToolCallIds } from './utils';

const systemPromptPath = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'systemPrompt.md',
);
const defaultSystemPrompt = readFileSync(systemPromptPath, 'utf-8');

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

  // Get model configuration
  const modelName = config.getOptionalString('aiChat.model') ?? 'gpt-4o-mini';

  // Get OpenAI configuration
  const openaiApiKey = config.getOptionalString('aiChat.openai.apiKey');
  const openaiBaseUrl = config.getOptionalString('aiChat.openai.baseUrl');

  // Get Anthropic configuration
  const anthropicApiKey = config.getOptionalString('aiChat.anthropic.apiKey');
  const anthropicBaseUrl = config.getOptionalString('aiChat.anthropic.baseUrl');

  // Determine which provider to use based on model name
  const isAnthropicModel = modelName.startsWith('claude-');
  const isOpenAIModel = modelName.startsWith('gpt-');

  // Validate configuration
  if (isAnthropicModel && !anthropicApiKey) {
    logger.warn(
      'No Anthropic API key configured for Anthropic model. Set aiChat.anthropic.apiKey in app-config.yaml',
    );
  }

  if (isOpenAIModel && !openaiApiKey) {
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

  router.post('/chat', async (req, res) => {
    // Verify user is authenticated
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;

    logger.info(`Chat request from user: ${userRef}`);

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
    } = await getMcpTools(config, authTokens, logger, mcpClientCache);
    logger.info(`MCP tools available: ${Object.keys(mcpTools).length}`);
    logger.info(`MCP tool names: ${Object.keys(mcpTools).join(', ')}`);
    if (failedServers.length > 0) {
      logger.warn(
        `${failedServers.length} MCP server(s) failed to connect: ${failedServers.map(s => s.name).join(', ')}`,
      );
    }

    // User-scoped tools that need access to the current request's credentials
    const userTools = createUserTools(userInfo, credentials);

    // MCP resource tools
    const mcpResourceTools = createResourceTools(mcpResources);

    // Build effective system prompt, including MCP server failure info if any
    let effectiveSystemPrompt = defaultSystemPrompt;
    if (failedServers.length > 0) {
      const failureNote = `\n\n---\n**Note:** The following MCP tool server(s) are currently unavailable: ${failedServers.map(s => s.name).join(', ')}. Some tools may not be available. If the user asks about functionality that requires these servers, let them know there's a connectivity issue.`;
      effectiveSystemPrompt += failureNote;
    }

    try {
      // Select the appropriate provider based on model type
      const selectedModel = isAnthropicModel
        ? anthropic(modelName)
        : openai(modelName);

      // Convert UI messages to model messages
      const modelMessages = await convertToModelMessages(
        messages as UIMessage[],
      );

      // Deduplicate tool call IDs to prevent Anthropic API errors
      const deduplicatedMessages = deduplicateToolCallIds(modelMessages);

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

      const result = streamText({
        model: selectedModel as any,
        messages: systemMessage
          ? [systemMessage, ...deduplicatedMessages]
          : deduplicatedMessages,
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
        } as ToolSet,
        providerOptions: isAnthropicModel
          ? {
              anthropic: {
                thinking: { type: 'enabled', budgetTokens: 10000 },
              },
            }
          : undefined,
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      result.pipeUIMessageStreamToResponse(res);
    } catch (error) {
      logger.error('Error in chat endpoint', error as Error);
      throw error;
    }
  });

  // Health check endpoint
  router.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      model: modelName,
      provider: isAnthropicModel ? 'anthropic' : 'openai',
      configured: isAnthropicModel ? !!anthropicApiKey : !!openaiApiKey,
      openaiConfigured: !!openaiApiKey,
      anthropicConfigured: !!anthropicApiKey,
    });
  });

  return router;
}
