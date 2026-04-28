import {
  HttpAuthService,
  LoggerService,
  resolvePackagePath,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import {
  convertToModelMessages,
  stepCountIs,
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
  stripStaleLargeToolResults,
} from './utils';
import { ConversationStore } from './services/ConversationStore';
import { createConversationRoutes } from './routes/conversationRoutes';

const STALE_TOOL_RESULT_STRIP_LIST = ['list_tools', 'list_core_tools'];

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
  conversationStore: ConversationStore;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { httpAuth, logger, config, userInfo, conversationStore } = options;

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

  // Maximum number of agent steps (model invocations) per chat turn.
  // Each tool call consumes one step, so this also bounds tool-call depth.
  // Required since `ai` v6, where `streamText` defaults to `stepCountIs(1)`
  // and would otherwise terminate the assistant turn immediately after the
  // first tool call, before the model ever sees the tool result.
  const maxSteps = config.getOptionalNumber('aiChat.maxSteps') ?? 20;

  // Get OpenAI configuration
  const openaiApiKey = config.getOptionalString('aiChat.openai.apiKey');
  const openaiBaseUrl = config.getOptionalString('aiChat.openai.baseUrl');
  // Selects which OpenAI-compatible endpoint we POST to. `responses`
  // (the SDK default) talks to `/v1/responses`; `chat` talks to
  // `/v1/chat/completions`. The latter is required for OpenAI-compatible
  // servers (notably vLLM) that crash on Responses-API tool replies
  // with `KeyError: 'role'`.
  const openaiApi =
    config.getOptionalString('aiChat.openai.api') === 'chat'
      ? 'chat'
      : 'responses';

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

  // OpenAI-compatible provider for `aiChat.openai.api: chat` (vLLM and similar
  // OpenAI-compatible servers). Unlike `@ai-sdk/openai`'s chat path, this
  // provider handles the `delta.reasoning` / `delta.reasoning_content` SSE
  // fields that vLLM emits when `--reasoning-parser` is configured (e.g.
  // `nemotron_v3` for Nemotron-Super), and forwards them as proper
  // `reasoning-start` / `reasoning-delta` / `reasoning-end` LanguageModelV3
  // stream parts. Without this, the reasoning phase appears as silence to
  // the chat UI and only the post-think answer text streams through.
  const openaiCompatible = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: openaiBaseUrl ?? '',
    apiKey: openaiApiKey,
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

    // Persist the conversation up-front (with just the user's message) so it
    // shows up in history immediately and survives stream interruptions. The
    // `onFinish` handler below updates the same row with the assistant reply.
    let persistedConversationId = conversationId;
    try {
      const saved = await conversationStore.saveConversation(
        userRef,
        messages as UIMessage[],
        conversationId,
      );
      persistedConversationId = saved.id;
    } catch (saveErr) {
      chatLogger.error(`Failed initial conversation save: ${saveErr}`);
    }

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

    // Debug metadata is gated on non-production builds in addition to the
    // request header, so toggling the feature flag in production can never
    // leak backend internals (system prompt, tool schemas) to the browser.
    const isDebugRequest =
      process.env.NODE_ENV !== 'production' &&
      req.headers['x-ai-chat-debug'] === 'true';

    try {
      // Select the appropriate provider based on model type
      // When Azure is configured, non-Anthropic models route through Azure
      let openaiCompatibleModel;
      if (isAzureConfigured) {
        openaiCompatibleModel = azure.chat(modelName);
      } else if (openaiApi === 'chat') {
        // Use @ai-sdk/openai-compatible for vLLM-style chat-completions servers
        // so reasoning chunks are surfaced (see provider construction above).
        openaiCompatibleModel = openaiCompatible.chatModel(modelName);
      } else {
        openaiCompatibleModel = openai(modelName);
      }
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

      // Replace bulky tool-results from prior turns (e.g. `list_tools` from
      // muster MCP servers, which can weigh ~20K tokens) with a short
      // placeholder so they are not resent on every turn. The most recent
      // result for each listed tool is kept intact.
      const { messages: prunedMessages, stats: stripStats } =
        stripStaleLargeToolResults(sanitizedMessages, {
          toolNames: STALE_TOOL_RESULT_STRIP_LIST,
        });
      if (stripStats.strippedCount > 0) {
        chatLogger.info('Stripped stale tool results from history', {
          strippedCount: stripStats.strippedCount,
          approxBytesSaved: stripStats.approxBytesSaved,
        });
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

      // Build the combined tool set
      const allTools = {
        ...frontendTools(tools),
        ...mcpTools,
        ...mcpResourceTools,
        listSkills,
        getSkill,
        ...userTools,
        ...contextUsageTools,
      };

      const result = streamText({
        model: selectedModel as any,
        messages: systemMessage
          ? [systemMessage, ...prunedMessages]
          : prunedMessages,
        system: isAnthropicModel ? undefined : effectiveSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
        stopWhen: stepCountIs(maxSteps),
        tools: allTools as ToolSet,
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

      // When the frontend debug flag is active, attach metadata about what
      // the backend sends to the LLM so it can be logged in the browser console.
      // Gated to non-production above, so header size is not a concern here.
      if (isDebugRequest) {
        let providerName = 'openai';
        if (isAnthropicModel) providerName = 'anthropic';
        else if (isAzureConfigured) providerName = 'azure';
        else if (openaiApi === 'chat') providerName = 'openai-compatible';

        const toolEntries = Object.entries(allTools).map(([name, t]) => ({
          name,
          description: (t as { description?: string }).description,
        }));

        const debugMeta = {
          model: modelName,
          provider: providerName,
          // Full system prompt the backend prepends to the user messages.
          systemPrompt: effectiveSystemPrompt,
          // Tools with descriptions (input schemas omitted to keep the
          // header under browser/Node limits for large tool catalogs).
          tools: toolEntries,
          mcpServers: {
            connected: connectedServers,
            failed: failedServers.map(s => s.name),
          },
          providerOptions: isAnthropicModel
            ? { thinking: { type: 'enabled', budgetTokens: 10000 } }
            : undefined,
          // Message transformations applied server-side (useful to spot
          // when the frontend's messages differ from what the LLM sees).
          messageCount: sanitizedMessages.length,
          hadUnsupportedContent,
        };
        // Base64-encode so non-ASCII characters in the system prompt or
        // tool descriptions don't violate HTTP header byte restrictions.
        res.setHeader(
          'X-AI-Chat-Debug-Meta',
          Buffer.from(JSON.stringify(debugMeta), 'utf-8').toString('base64'),
        );
        // Browsers hide non-standard response headers from JavaScript on
        // cross-origin requests unless explicitly exposed. Frontend on
        // :3000, backend on :7007 makes every request cross-origin.
        res.setHeader('Access-Control-Expose-Headers', 'X-AI-Chat-Debug-Meta');
      }

      // Backstage's root HTTP router applies compression() middleware
      // globally, which buffers res.write() calls. For SSE this means
      // every event is held until res.end(), defeating real-time streaming.
      // Wrap res.write to auto-flush after each write so chunks reach the
      // client as the LLM produces them.
      const originalWrite = res.write;
      res.write = function flushingWrite(
        ...args: Parameters<typeof originalWrite>
      ) {
        const ret = originalWrite.apply(res, args);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
        return ret;
      } as typeof originalWrite;

      result.pipeUIMessageStreamToResponse(res, {
        originalMessages: messages as UIMessage[],
        generateMessageId: () => crypto.randomUUID(),
        onFinish({ messages: allMessages }) {
          // Fire-and-forget: update the conversation row created up-front
          // with the full message history including the assistant reply.
          conversationStore
            .saveConversation(userRef, allMessages, persistedConversationId)
            .then(saved => {
              chatLogger.debug(
                `Saved conversation ${saved.id} (${allMessages.length} messages)`,
              );
            })
            .catch(saveErr => {
              chatLogger.error(`Failed to save conversation: ${saveErr}`);
            });
        },
      });
    } catch (error) {
      chatLogger.error('Error in chat endpoint', error as Error);
      throw error;
    }
  });

  // Conversation history CRUD routes
  router.use(
    '/conversations',
    createConversationRoutes({
      store: conversationStore,
      httpAuth,
      logger,
    }),
  );

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
