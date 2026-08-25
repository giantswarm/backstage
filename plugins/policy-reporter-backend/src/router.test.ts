import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import { policyReporterServiceRef } from './services/PolicyReporterService';

const mockDashboard = {
  summary: {
    pass: 5,
    fail: 1,
  },
};

// TEMPLATE NOTE:
// Testing the router directly allows you to write a unit test that mocks the provided options.
describe('createRouter', () => {
  let app: express.Express;
  let policyReporter: {
    dashboard: jest.Mock;
  };

  beforeEach(async () => {
    policyReporter = {
      dashboard: jest.fn(),
    };

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      policyReporter: policyReporter as unknown as typeof policyReporterServiceRef.T,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  it('should proxy dashboard requests', async () => {
    policyReporter.dashboard.mockResolvedValue(mockDashboard);

    const response = await request(app)
      .get('/dev/dashboard')
      .query({
        namespace: 'kyverno',
        status: ['fail', 'warn'],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockDashboard);
    expect(policyReporter.dashboard).toHaveBeenCalledWith(
      {
        cluster: 'dev',
        query: {
          namespace: 'kyverno',
          status: ['fail', 'warn'],
        },
      },
      {
        credentials: mockCredentials.user(),
      },
    );
  });

  it('should not allow unauthenticated dashboard requests', async () => {
    policyReporter.dashboard.mockResolvedValue(mockDashboard);

    const response = await request(app)
      .get('/dev/dashboard')
      .set('Authorization', mockCredentials.none.header())

    expect(response.status).toBe(401);
  });
});
