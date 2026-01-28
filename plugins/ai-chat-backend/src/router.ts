import {
  HttpAuthService,
  LoggerService,
  resolvePackagePath,
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
  jsonSchema,
} from 'ai';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { readFileSync } from 'fs';
import { getMcpTools } from './getMcpTools';
import { extractMCPAuthTokens } from './extractMCPAuthTokens';
import { frontendTools } from './frontendTools';

const systemPromptPath = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'systemPrompt.md',
);
const defaultSystemPrompt = readFileSync(systemPromptPath, 'utf-8');

export interface RouterOptions {
  httpAuth: HttpAuthService;
  logger: LoggerService;
  config: Config;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, logger, config } = options;

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

    const authTokens = extractMCPAuthTokens(req.headers);
    const { tools: mcpTools, resources: mcpResources } = await getMcpTools(
      config,
      authTokens,
    );

    try {
      // Select the appropriate provider based on model type
      const selectedModel = isAnthropicModel
        ? anthropic(modelName)
        : openai(modelName);

      // Convert UI messages to model messages
      const modelMessages = await convertToModelMessages(
        messages as UIMessage[],
      );

      // Convert MCP resources to tools that can be called on-demand
      const resourceTools: ToolSet = {};
      let resourceIndex = 0;
      for (const [name, content] of Object.entries(mcpResources)) {
        // Create a short, unique tool name (max 128 chars for API)
        const sanitizedName = name
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 100);
        const toolName = `mcp_resource_${resourceIndex}_${sanitizedName}`;

        resourceTools[toolName] = {
          description: `Get MCP resource: ${name}`,
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: async () => content,
        };
        resourceIndex++;
      }

      // For Anthropic models, prepend system message with cache control
      // to enable prompt caching for the system prompt.
      // See: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#cache-control
      const systemMessages: SystemModelMessage[] = isAnthropicModel
        ? [
            {
              role: 'system',
              content: defaultSystemPrompt,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
          ]
        : [];

      const result = streamText({
        model: selectedModel as any,
        messages: [...systemMessages, ...modelMessages],
        system: isAnthropicModel ? undefined : defaultSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
        tools: {
          ...frontendTools(tools),
          ...mcpTools,
          ...resourceTools,
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
