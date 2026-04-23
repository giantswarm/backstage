import { mockServices } from '@backstage/backend-test-utils';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import express from 'express';
import { createRouter } from './router';

// Stubs for dependencies that the branding routes do not exercise.
const noopGithubCredentialsProvider = {
  getCredentials: jest.fn(),
} as any;
const noopContainerRegistry = {} as any;
const noopMimir = {} as any;

async function buildApp(assetsPath: string | undefined) {
  const config = mockServices.rootConfig({
    data: assetsPath ? { gs: { branding: { assetsPath } } } : {},
  });
  const router = await createRouter({
    config,
    logger: mockServices.logger.mock(),
    containerRegistry: noopContainerRegistry,
    mimir: noopMimir,
    githubCredentialsProvider: noopGithubCredentialsProvider,
  });
  const app = express();
  app.use(router);
  return app;
}

describe('gs-backend router branding routes', () => {
  let assetsDir: string;

  beforeEach(() => {
    assetsDir = mkdtempSync(join(tmpdir(), 'branding-test-'));
  });

  afterEach(() => {
    rmSync(assetsDir, { recursive: true, force: true });
  });

  it('serves a manifest listing files present in the assets directory', async () => {
    writeFileSync(
      join(assetsDir, 'logo-full.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(join(assetsDir, 'logo-icon.png'), 'binary-data');

    const app = await buildApp(assetsDir);
    const res = await request(app).get('/branding/manifest');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      assets: {
        'logo-full.svg': true,
        'logo-icon.png': true,
      },
    });
  });

  it('serves asset files with correct content', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    writeFileSync(join(assetsDir, 'logo-full.svg'), svg);

    const app = await buildApp(assetsDir);
    const res = await request(app).get('/branding/logo-full.svg');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
    expect(res.text).toBe(svg);
  });

  it('returns an empty manifest when the configured directory does not exist', async () => {
    const missing = join(assetsDir, 'does-not-exist');
    const app = await buildApp(missing);

    const res = await request(app).get('/branding/manifest');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ assets: {} });
  });

  it('does not serve assets when the directory does not exist', async () => {
    const missing = join(assetsDir, 'does-not-exist');
    const app = await buildApp(missing);

    const res = await request(app).get('/branding/logo-full.svg');

    expect(res.status).toBe(404);
  });
});
