import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export async function createRouter({
  config,
  logger,
}: {
  config: RootConfigService;
  logger: LoggerService;
}): Promise<express.Router> {
  const router = Router();

  const assetsPath =
    config.getOptionalString('app.branding.assetsPath') ??
    '/app/branding-assets';
  const resolvedAssetsPath = resolve(assetsPath);

  if (existsSync(resolvedAssetsPath)) {
    const files = readdirSync(resolvedAssetsPath);
    const assets: Record<string, number> = {};
    for (const file of files) {
      assets[file] = statSync(join(resolvedAssetsPath, file)).mtimeMs;
    }

    router.get('/manifest', (_req, res) => {
      res.json({ assets });
    });

    router.use(
      express.static(resolvedAssetsPath, {
        maxAge: '1d',
      }),
    );

    logger.info(
      `Serving ${files.length} branding asset(s) from ${resolvedAssetsPath}`,
    );
  } else {
    router.get('/manifest', (_req, res) => {
      res.json({ assets: {} });
    });

    logger.info(
      `Branding assets directory not found at ${resolvedAssetsPath}, serving defaults`,
    );
  }

  return router;
}
