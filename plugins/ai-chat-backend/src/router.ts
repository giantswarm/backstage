import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';

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
  router.use(express.json());

  // Get OpenAI configuration
  const openaiApiKey = config.getOptionalString('aiChat.openai.apiKey');
  const openaiBaseUrl = config.getOptionalString('aiChat.openai.baseUrl');
  const modelName = config.getOptionalString('aiChat.model') ?? 'gpt-4o-mini';

  if (!openaiApiKey) {
    logger.warn(
      'No OpenAI API key configured. Set aiChat.openai.apiKey in app-config.yaml',
    );
  }

  const openai = createOpenAI({
    apiKey: openaiApiKey,
    baseURL: openaiBaseUrl,
  });

  // Schema for chat request
  const chatRequestSchema = z.object({
    messages: z.array(z.any()),
    tools: z.record(z.string(), z.any()).optional(),
  });

  const defaultSystemPrompt = `
  ## Your role

  You are a helpful assistant integrated into Backstage, a developer portal, provided by Giant Swarm.
  You are an expert in Kubernetes, Flux CD, Helm and cloud-native technologies. However, you elegantly
  adapt to the skill level of the user, who may or may not be an expert in any of these topics.

  ## Your task

  Your task is to help the user with their questions about their clusters, application deployments,
  software catalog, and documentation.

  ## The Backstage developer portal

  Backstage is an Open Source Software provided by Spotify and the open source developer community.
  The Backstage developer portal the user is using is configured and managed by Giant Swarm.
  It provides the following capabilities taylored for Giant Swarm customers:

  - Clusters: the user can inspect existing Kubernetes clusters
  - Deployments: the user can inspect existing application deployments (based on Giant Swarm App or Flux HelmRelease resources)
  - Flux: the user can get an overview of Flux sources like GitRepositories and deployment resources like HelmReleases and Kustomizations, and inspect their state
  - Catalog: here the user can find applications running in management and workload clusters, and applications available for deployment
  - Docs: Access to documentation about components in the Catalog

  More information about the Backstage developer portal can be found in the documentation: https://docs.giantswarm.io/overview/developer-portal/

  ## MCP tools

  You have access to several MCP tools. Kubernetes related tools are prefixed with the name of the manegement cluster they are associated with.
  For example: 'graveler_kubernetes_list' is for listing Kubernetes resources on graveler.

  ### CLUSTERNAME_kubernetes_list

  This tool is used to list Kubernetes resources on a specific management cluster.
  Make sure to use the 'filter' parameter to filter the results only to the resources you are interested in.
  For example, to fetch Flux HelmRelease resources that are suspended, use the filter {"spec.suspend": true}.

  ## More context

  - "MCP" stands for "Model Context Protocol". You are free to give the user details about the MCP tools available to you.
  
  `;

  router.post('/chat', async (req, res) => {
    // Verify user is authenticated
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;

    logger.info(`Chat request from user: ${userRef}`);

    if (!openaiApiKey) {
      throw new InputError(
        'OpenAI API key not configured. Set aiChat.openai.apiKey in app-config.yaml',
      );
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(`Invalid request body: ${parsed.error.message}`);
    }

    const { messages } = parsed.data;

    try {
      const result = streamText({
        model: openai(modelName),
        messages: convertToModelMessages(messages as UIMessage[]),
        system: defaultSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
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
      configured: !!openaiApiKey,
      model: modelName,
    });
  });

  return router;
}
