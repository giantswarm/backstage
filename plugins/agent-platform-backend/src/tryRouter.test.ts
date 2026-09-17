import { ConfigReader } from '@backstage/config';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { createTryRouter } from './tryRouter';
import { SERVED_MODEL_AUTH_HEADER } from './tryServedModel';

const config = new ConfigReader({
  gs: {
    installations: {
      gazelle: { baseDomain: 'gazelle.example' },
      bare: {},
    },
  },
});

function app(fetchFn: typeof fetch) {
  const logger = mockServices.logger.mock();
  const router = createTryRouter({ config, fetchFn });
  const middleware = MiddlewareFactory.create({
    logger,
    config: new ConfigReader({}),
  });
  return express().use(router).use(middleware.error());
}

const completion = jest.fn(async (_url: any, init: any) => {
  const headers = init.headers as Record<string, string>;
  return headers.Authorization
    ? new Response(
        JSON.stringify({ choices: [{ message: { content: 'pong' } }] }),
        { status: 200 },
      )
    : new Response('no bearer token', { status: 401 });
}) as unknown as typeof fetch;

describe('POST /served-models/try', () => {
  beforeEach(() => (completion as unknown as jest.Mock).mockClear());

  it('tries the served model on the installation’s own domain as the person and answers both outcomes', async () => {
    const response = await request(app(completion))
      .post('/served-models/try')
      .set(SERVED_MODEL_AUTH_HEADER, 'id-token')
      .send({
        installation: 'gazelle',
        model: 'qwen3-4b-instruct',
        url: 'https://models.gazelle.example/model-serving/qwen3-4b-instruct',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      url: 'https://models.gazelle.example/model-serving/qwen3-4b-instruct/v1/chat/completions',
      model: 'qwen3-4b-instruct',
      without: { status: 401, error: 'no bearer token' },
      with: { status: 200, content: 'pong' },
    });
    const calls = (completion as unknown as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1].headers.Authorization).toBe('Bearer id-token');
  });

  it('refuses a request without the person’s token before sending anything', async () => {
    const response = await request(app(completion))
      .post('/served-models/try')
      .send({
        installation: 'gazelle',
        model: 'qwen3-4b-instruct',
        url: 'https://models.gazelle.example/x',
      });

    expect(response.status).toBe(401);
    expect(completion).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an endpoint on another host',
      { installation: 'gazelle', model: 'q', url: 'https://evil.example/x' },
      /not under the installation's domain/,
    ],
    [
      'an installation without a base domain',
      {
        installation: 'bare',
        model: 'q',
        url: 'https://models.bare.example/x',
      },
      /no base domain/,
    ],
    [
      'an unknown installation',
      {
        installation: 'nope',
        model: 'q',
        url: 'https://models.nope.example/x',
      },
      /no base domain/,
    ],
    [
      'a model id that is not a reference',
      {
        installation: 'gazelle',
        model: 'not a model',
        url: 'https://gazelle.example/x',
      },
      /model must be a model reference/,
    ],
    [
      'a missing url',
      { installation: 'gazelle', model: 'q' },
      /url must be a string/,
    ],
  ])('refuses %s with 400 and sends nothing', async (_what, body, message) => {
    const response = await request(app(completion))
      .post('/served-models/try')
      .set(SERVED_MODEL_AUTH_HEADER, 'id-token')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(message);
    expect(completion).not.toHaveBeenCalled();
  });
});
