import { frontendTools } from '@assistant-ui/react-ai-sdk';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, ToolSet, UIMessage } from 'ai';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { getMcpTools } from './getMcpTools';

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

  const defaultSystemPrompt = `
  ## Your role

  You are a helpful assistant integrated into Backstage, a developer portal, provided by Giant Swarm.
  You are an expert in Kubernetes, Flux CD, Helm and other cloud-native technologies. However, you elegantly
  adapt to the skill level of the user, who may or may not be an expert in any of these topics.

  ## Your task

  Your task is to help the user with their questions about their clusters, application deployments,
  software catalog, and documentation.

  Please respond concisely and to the point. Be friendly and professional. Don't be chatty.

  ### Giant Swarm platform details

  - An Organization is a concept to separate tenants in a management cluster.
  - Organizations are defined by the cluster-scoped Organization CR (organizations.security.giantswarm.io).
  - Each organization has a dedicated namespace in the management cluster, named after the organization, with the prefix 'org-'.
  - An installation is the combination of a management cluster and all workload clusters managed by that management cluster.
  - Each installation has a unique name, which is identical with its management cluster name.
  - To get details about an installation, fetch the entitity with kind "resource" and type "installation" from the catalog, named like the installation.
  - Clusters are managed via Kubernetes Cluster API (CAPI).
    - The main resource defining a cluster is the Cluster CR (clusters.cluster.x-k8s.io). In the Giant Swarm platform, this resource is found in the namespace of the organization owning the cluster.
    - The Cluster CR has a reference to the InfrastructureRef, which is a reference to the infrastructure provider.
    - The Cluster CR has a reference to the ControlPlaneRef, which is a reference to the control plane.
  - Applications are deployed in several ways:
    - To the management cluster:
      - Via App CRs or HelmRelease CRs in the management cluster. These CRs can reside in various namespaces.
    - To workload clusters:
      - Via App CRs or HelmRelease CRs in the workload clusters. These resources usually reside in the namespace of the organization that owns the cluster.
      - Via Helm directly on the workload clusters.
      - Via directly applying manifests for Deployments, StatefulSets, Deamonsets, etc.
  - The CNI used is Cilium

  More details about the Giant Swarm platform can be found in the documentation: https://docs.giantswarm.io/llms.txt

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

  You have access to several MCP tools.

  ## More context

  - "MCP" stands for "Model Context Protocol". You are free to give the user details about the MCP tools available to you.
  `;

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

    const mcpTools = await getMcpTools(config);
    logger.debug('==================MCP TOOLS====================');
    logger.debug(JSON.stringify(mcpTools));
    logger.debug('===============================================');

    try {
      // Select the appropriate provider based on model type
      const selectedModel = isAnthropicModel
        ? anthropic(modelName)
        : openai(modelName);

      const result = streamText({
        model: selectedModel as any,
        messages: convertToModelMessages(messages as UIMessage[]),
        system: defaultSystemPrompt,
        abortSignal: req.socket ? undefined : undefined,
        tools: {
          ...frontendTools(tools),
          ...mcpTools,
        } as ToolSet,
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
