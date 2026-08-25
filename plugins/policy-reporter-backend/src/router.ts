import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { z } from 'zod/v3';
import { policyReporterServiceRef } from './services/PolicyReporterService';

export async function createRouter({
  httpAuth,
  policyReporter,
}: {
  httpAuth: HttpAuthService;
  policyReporter: typeof policyReporterServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const exceptionSchema = z.object({
    source: z.string(),
    category: z.string().optional(),
    policies: z.array(z.unknown()).optional(),
  });

  const getScope = (req: express.Request) => {
    const cluster = req.params.cluster as string;
    if (!cluster) {
      throw new InputError('cluster path parameter is required');
    }

    return { cluster };
  };

  const getQuery = (req: express.Request) => {
    const query = readQueryParams(req.query, []);
    return Object.keys(query).length > 0 ? query : undefined;
  };

  const withJson = (
    handler: (req: express.Request) => Promise<unknown>,
  ) => {
    return async (req: express.Request, res: express.Response) => {
      await httpAuth.credentials(req, { allow: ['user'] });
      res.json(await handler(req));
    };
  };

  const withBinary = (
    handler: (req: express.Request) => Promise<{ data: Buffer; contentType?: string }>,
  ) => {
    return async (req: express.Request, res: express.Response) => {
      await httpAuth.credentials(req, { allow: ['user'] });
      const result = await handler(req);
      if (result.contentType) {
        res.contentType(result.contentType);
      }
      res.send(result.data);
    };
  };

  router.get('/profile', withJson(() =>
    policyReporter.profile(),
  ));

  router.get('/config', withJson(() => {
    return policyReporter.config();
  }));

  router.get('/:cluster/layout', withJson(req =>
    policyReporter.layout(getScope(req)),
  ));

  router.get('/:cluster/dashboard', withJson(req =>
    policyReporter.dashboard({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id', withJson(req =>
    policyReporter.customBoard({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/resource/:id/resource-results', withJson(req =>
    policyReporter.resourceResults({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/resource/:id/results', withJson(req =>
    policyReporter.results({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/resource/:id', withJson(req =>
    policyReporter.resource({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.post('/:cluster/resource/:id/exception', withJson(async req => {
    const parsed = exceptionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    return policyReporter.createException({
      id: req.params.id as string,
      cluster: req.params.cluster as string,
      source: parsed.data.source,
      category: parsed.data.category,
      policies: parsed.data.policies,
    });
  }));

  router.get('/:cluster/policy-sources', withJson(req =>
    policyReporter.policySources({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/targets', withJson(req =>
    policyReporter.targets(getScope(req)),
  ));

  router.get('/:cluster/namespaces', withJson(req =>
    policyReporter.namespaces({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/namespace', withJson(req =>
    policyReporter.namespace({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/namespace-scoped/results', withJson(req =>
    policyReporter.namespacedResults({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/cluster-scoped/results', withJson(req =>
    policyReporter.clusterResults({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/namespace-scoped/resource-results', withJson(req =>
    policyReporter.namespacedResourceResults({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/cluster-scoped/resource-results', withJson(req =>
    policyReporter.clusterResourceResults({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/results-without-resource', withJson(req =>
    policyReporter.resultsWithoutResources({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/clusters', withJson(() =>
    policyReporter.clustersDashboard({}),
  ));

  router.get('/:cluster/total-results', withJson(req =>
    policyReporter.totalResults({ ...getScope(req), query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/resource-results', withJson(req =>
    policyReporter.customBoardNamespacedResourceResults({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/results', withJson(req =>
    policyReporter.customBoardNamespacedResults({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/cluster-resource-results', withJson(req =>
    policyReporter.customBoardClusterResourceResults({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/cluster-results', withJson(req =>
    policyReporter.customBoardClusterResults({ ...getScope(req), id: req.params.id as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/resource/:resource', withJson(req =>
    policyReporter.customBoardResource({ ...getScope(req), id: req.params.id as string, resource: req.params.resource as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/custom-board/:id/resource/:resource/results', withJson(req =>
    policyReporter.customBoardResourceResults({ ...getScope(req), id: req.params.id as string, resource: req.params.resource as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/:source/policy/details', withJson(req =>
    policyReporter.policyDetails({
      ...getScope(req),
      source: req.params.source as string,
      policy: readRequiredQueryValue(req.query.policy, 'policy'),
      namespace: readSingleQueryValue(req.query.namespace),
      status: readArrayQueryValue(req.query.status),
      kinds: readArrayQueryValue(req.query.kinds),
    }),
  ));

  router.get('/:cluster/:source/policy-report', withBinary(req =>
    policyReporter.policyHTMLReport({ ...getScope(req), source: req.params.source as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/:source/namespace-report', withBinary(req =>
    policyReporter.namespaceHTMLReport({ ...getScope(req), source: req.params.source as string, query: getQuery(req) }),
  ));

  router.get('/:cluster/:source/policies', withJson(req =>
    policyReporter.policies({ ...getScope(req), source: req.params.source as string, query: getQuery(req) }),
  ));

  return router;
}

function readSingleQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}

function readRequiredQueryValue(value: unknown, name: string): string {
  const parsed = readSingleQueryValue(value);
  if (!parsed) {
    throw new InputError(`${name} query parameter is required`);
  }
  return parsed;
}

function readArrayQueryValue(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value
      .flatMap(item => (typeof item === 'string' ? item.split(',') : []))
      .map(item => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const values = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function readQueryParams(
  query: express.Request['query'],
  omit: string[],
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(query)) {
    if (omit.includes(key)) {
      continue;
    }

    const parsedArray = readArrayQueryValue(value);
    if (parsedArray && parsedArray.length > 1) {
      params[key] = parsedArray;
      continue;
    }

    if (parsedArray && parsedArray.length === 1) {
      params[key] = parsedArray[0];
      continue;
    }

    const parsedSingle = readSingleQueryValue(value);
    if (parsedSingle !== undefined) {
      params[key] = parsedSingle;
    }
  }

  return params;
}
