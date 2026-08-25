import {
  startTestBackend,
} from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { policyReporterServiceRef } from './services/PolicyReporterService';
import { policyReporterPlugin } from './plugin';
import request from 'supertest';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import {
  ConflictError,
} from '@backstage/errors';

describe('plugin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('should proxy dashboard requests using the cluster referenced by the entity', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { pass: 8, fail: 2 } }),
    }) as typeof fetch;

    const { server } = await startTestBackend({
      features: [
        policyReporterPlugin,
        catalogServiceMock.factory({
          entities: [
            {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Resource',
              metadata: {
                name: 'dev',
                namespace: 'default',
                annotations: {
                  'kyverno.io/endpoint': 'http://localhost:8080/',
                },
              },
              spec: {
                type: 'kubernetes-cluster',
                owner: 'user:default/guest',
              },
            },
            {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Component',
              metadata: {
                name: 'policy-reporter',
                namespace: 'default',
              },
              spec: {
                type: 'service',
                owner: 'user:default/guest',
                dependsOn: ['resource:default/dev'],
              },
            },
          ],
        }),
      ],
    });

    const response = await request(server)
      .get('/api/policy-reporter/dev/dashboard')
      .query({
        entityRef: 'component:default/policy-reporter',
        namespace: 'kyverno',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary: { pass: 8, fail: 2 } });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/dev/dashboard?namespace=kyverno',
      {
        method: 'GET',
        headers: undefined,
        body: undefined,
      },
    );
  });

  it('should support explicit cluster selection for entities with multiple clusters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { pass: 3, fail: 0 } }),
    }) as typeof fetch;

    const { server } = await startTestBackend({
      features: [
        policyReporterPlugin,
        catalogServiceMock.factory({
          entities: [
            {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Resource',
              metadata: {
                name: 'dev',
                namespace: 'default',
                annotations: {
                  'kyverno.io/endpoint': 'http://localhost:8080/',
                },
              },
              spec: {
                type: 'kubernetes-cluster',
                owner: 'user:default/guest',
              },
            },
            {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Resource',
              metadata: {
                name: 'test',
                namespace: 'default',
                annotations: {
                  'kyverno.io/endpoint': 'http://localhost:8080/',
                },
              },
              spec: {
                type: 'kubernetes-cluster',
                owner: 'user:default/guest',
              },
            },
            {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'Component',
              metadata: {
                name: 'my-component',
                namespace: 'default',
              },
              spec: {
                type: 'service',
                owner: 'me',
                dependsOn: ['resource:default/dev', 'resource:default/test'],
              },
            },
          ],
        }),
      ],
    });

    const response = await request(server)
      .get('/api/policy-reporter/test/dashboard')
      .query({
        entityRef: 'component:default/my-component',
      });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/test/dashboard',
      {
        method: 'GET',
        headers: undefined,
        body: undefined,
      },
    );
  });

  it('should forward errors from the PolicyReporterService', async () => {
    const { server } = await startTestBackend({
      features: [
        policyReporterPlugin,
        createServiceFactory({
          service: policyReporterServiceRef,
          deps: {},
          factory: () => ({
            dashboard: jest.fn().mockRejectedValue(new ConflictError()),
          } as unknown as typeof policyReporterServiceRef.T),
        })
      ],
    });

    const response = await request(server)
      .get('/api/policy-reporter/dev/dashboard')
      .query({ entityRef: 'component:default/my-component' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { name: 'ConflictError' },
    });
  });
});
