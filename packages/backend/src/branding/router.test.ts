import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { createRouter } from './router';

async function buildApp(assetsPath: string | undefined) {
  const config = mockServices.rootConfig({
    data: assetsPath ? { app: { branding: { assetsPath } } } : {},
  });
  const router = await createRouter({
    config,
    logger: mockServices.logger.mock(),
  });
  const app = express();
  app.use(router);
  return app;
}

describe('branding router', () => {
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
    const res = await request(app).get('/manifest');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      assets: {
        'logo-full.svg': expect.any(Number),
        'logo-icon.png': expect.any(Number),
      },
    });
  });

  it('serves asset files with correct content', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    writeFileSync(join(assetsDir, 'logo-full.svg'), svg);

    const app = await buildApp(assetsDir);
    // superagent has no default parser for image/svg+xml, so buffer manually.
    const res = await request(app)
      .get('/logo-full.svg')
      .buffer(true)
      .parse((response, cb) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/svg/);
    expect(res.body).toBe(svg);
  });

  it('returns an empty manifest when the configured directory does not exist', async () => {
    const missing = join(assetsDir, 'does-not-exist');
    const app = await buildApp(missing);

    const res = await request(app).get('/manifest');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ assets: {} });
  });

  it('does not serve assets when the directory does not exist', async () => {
    const missing = join(assetsDir, 'does-not-exist');
    const app = await buildApp(missing);

    const res = await request(app).get('/logo-full.svg');

    expect(res.status).toBe(404);
  });
});
