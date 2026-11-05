import { MimirClient } from './MimirClient';
import { MimirQueryError } from './MimirQueryError';

function clientAnswering(status: number, body: unknown) {
  const fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
  const client = new MimirClient({
    discoveryApi: {
      getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/gs'),
    },
    fetchApi: { fetch },
  });
  return { client, fetch };
}

const query = { installationName: 'alba', query: 'up', oidcToken: 'tok' };

describe('MimirClient', () => {
  it("carries the backend's reason on the error", async () => {
    const { client } = clientAnswering(503, {
      error: {
        name: 'ServiceUnavailableError',
        message:
          'Mimir could not answer the query for installation "alba" (HTTP 500)',
        reason: 'older_data_unavailable',
      },
    });

    const error = await client.query(query).catch(e => e);

    expect(error).toBeInstanceOf(MimirQueryError);
    expect(error.status).toBe(503);
    expect(error.reason).toBe('older_data_unavailable');
    expect(error.message).toBe(
      'Mimir could not answer the query for installation "alba" (HTTP 500)',
    );
  });

  it('drops a reason it has no words for', async () => {
    const { client } = clientAnswering(503, {
      error: { message: 'down', reason: 'something_else' },
    });

    const error = await client
      .queryRange({ ...query, start: '1', end: '2', step: '1d' })
      .catch(e => e);

    expect(error.reason).toBeUndefined();
  });

  it('keeps the names the retry policy reads', async () => {
    const { client } = clientAnswering(401, {});

    const error = await client.query(query).catch(e => e);

    expect(error.name).toBe('UnauthorizedError');
    expect(error.message).toBe('Mimir query failed with status 401');
  });

  it("names a query Mimir refused, with Mimir's words, so it is not retried", async () => {
    const { client } = clientAnswering(400, {
      error: {
        name: 'InputError',
        message:
          'Mimir refused the query for installation "alba" (HTTP 422): exceeded maximum resolution',
      },
    });

    const error = await client.query(query).catch(e => e);

    expect(error.name).toBe('InputError');
    expect(error.message).toMatch(/exceeded maximum resolution$/);
  });
});
