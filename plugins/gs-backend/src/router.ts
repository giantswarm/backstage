import { InputError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';

export async function createRouter({
  containerRegistry,
}: {
  containerRegistry: typeof containerRegistryServiceRef.T;
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

  return router;
}
