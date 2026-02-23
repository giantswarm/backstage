import { InputError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';
import { mimirServiceRef } from './services/MimirService';

export async function createRouter({
  containerRegistry,
  mimir,
}: {
  containerRegistry: typeof containerRegistryServiceRef.T;
  mimir: typeof mimirServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  /**
   * GET /container-registry/tags
   *
   * Fetches tags from a container registry for a given repository.
   *
   * Query parameters:
   * - registry: The container registry (e.g., ghcr.io)
   * - repository: The repository path (e.g., giantswarm/my-app)
   *
   * Returns:
   * - tags: Array of version tags sorted by semver (newest first)
   * - latestStableVersion: The most recent non-prerelease version
   */
  router.get('/container-registry/tags', async (req, res) => {
    const schema = z.object({
      registry: z.string(),
      repository: z.string(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { registry, repository } = parsed.data;

    res.json(await containerRegistry.getTags(registry, repository));
  });

  /**
   * GET /container-registry/tag-manifest
   *
   * Fetches the manifest for a specific tag from a container registry.
   *
   * Query parameters:
   * - registry: The container registry (e.g., ghcr.io)
   * - repository: The repository path (e.g., giantswarm/my-app)
   * - tag: The tag to fetch the manifest for (e.g., 1.0.0)
   *
   * Returns:
   * - The raw manifest content
   */
  router.get('/container-registry/tag-manifest', async (req, res) => {
    const schema = z.object({
      registry: z.string(),
      repository: z.string(),
      tag: z.string(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { registry, repository, tag } = parsed.data;

    res.json(await containerRegistry.getTagManifest(registry, repository, tag));
  });

  /**
   * GET /mimir/query
   *
   * Proxies an instant PromQL query to the Mimir observability endpoint
   * for the given installation.
   *
   * Query parameters:
   * - query: PromQL expression
   * - installationName: GS installation name
   *
   * Headers:
   * - X-Mimir-Token: OIDC token for the installation (required)
   */
  router.get('/mimir/query', async (req, res) => {
    const schema = z.object({
      query: z.string().min(1),
      installationName: z.string().min(1),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const oidcToken = req.headers['x-mimir-token'];
    if (!oidcToken || typeof oidcToken !== 'string') {
      throw new InputError('Missing required header: X-Mimir-Token');
    }

    const { query, installationName } = parsed.data;

    res.json(await mimir.query({ query, installationName, oidcToken }));
  });

  return router;
}
