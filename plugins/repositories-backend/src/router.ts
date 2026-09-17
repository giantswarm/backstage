import express from 'express';
import Router from 'express-promise-router';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  MusterServerGateway,
  NotConnectedError,
  asConnected,
  errorHandler,
} from '@giantswarm/backstage-plugin-gs-node';
import { RepositoriesClient } from './client';
import { grantAuthUrl, isNoGrant } from './service/grant';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  gateway: MusterServerGateway;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, gateway } = options;
  const server =
    config.getOptionalString('repositories.muster.server') ??
    'giantswarm-repo-manager';
  const grantServer = config.getOptionalString(
    'repositories.muster.grantServer',
  );
  const client = new RepositoriesClient(server, gateway);

  // Runs a manager call as a connected person. When the manager answers that
  // the person has no GitHub grant yet and a grant server is configured, the
  // answer becomes a 401 carrying the grant server's connect URL, so the
  // page's existing bounce sends the person through GitHub's consent.
  const withGrant = async <T>(
    req: express.Request,
    fn: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await asConnected(gateway, server, req, fn);
    } catch (err) {
      if (grantServer && isNoGrant(err)) {
        logger.info(
          `repositories: no GitHub grant on ${grantServer}, bouncing to connect`,
        );
        const authUrl = await grantAuthUrl(gateway, grantServer, req);
        throw new NotConnectedError(401, authUrl, grantServer);
      }
      throw err;
    }
  };

  const router = Router();
  router.use(express.json());

  router.get('/connection', async (req, res) => {
    const manager = await asConnected(gateway, server, req, async () => ({
      connected: true,
    }));
    if (!grantServer) {
      res.json(manager);
      return;
    }
    const grant = await gateway.status(grantServer, req);
    res.json({
      ...manager,
      grant: {
        server: grantServer,
        connected: grant.connected,
        ...(grant.connected
          ? {}
          : { authUrl: await grantAuthUrl(gateway, grantServer, req) }),
      },
    });
  });

  router.get('/repositories', async (req, res) => {
    res.json(await withGrant(req, () => client.listRepositories()));
  });

  router.get('/repositories/:name', async (req, res) => {
    res.json(
      await withGrant(req, () => client.describeRepository(req.params.name)),
    );
  });

  router.get('/info', async (req, res) => {
    res.json(await withGrant(req, () => client.getInfo()));
  });

  router.post('/repositories', async (req, res) => {
    res.json(await withGrant(req, () => client.createRepository(req.body)));
  });

  router.post('/repositories/:name/deprecate', async (req, res) => {
    res.json(
      await withGrant(req, () => client.deprecateRepository(req.params.name)),
    );
  });

  router.post('/repositories/:name/archive', async (req, res) => {
    res.json(
      await withGrant(req, () => client.archiveRepository(req.params.name)),
    );
  });

  router.use(errorHandler());
  return router;
}
