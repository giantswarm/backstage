import { k8sResponseError, k8sResponseReason } from './k8sResponseError';

function failedResponse(response: Partial<Response>): Response {
  return { ok: false, statusText: '', ...response } as Response;
}

describe('k8sResponseError', () => {
  it('uses the message of a Kubernetes Status body', async () => {
    const error = await k8sResponseError(
      failedResponse({
        status: 404,
        json: async () => ({
          kind: 'Status',
          reason: 'NotFound',
          message:
            'kubeadmcontrolplanes.controlplane.cluster.x-k8s.io "x" not found',
        }),
      }),
      'Failed to fetch x',
    );

    expect(error.message).toBe(
      'Failed to fetch x. Reason: kubeadmcontrolplanes.controlplane.cluster.x-k8s.io "x" not found.',
    );
  });

  it('uses the message of a Backstage error body when the proxy itself failed', async () => {
    const error = await k8sResponseError(
      failedResponse({
        status: 500,
        json: async () => ({
          error: {
            name: 'Error',
            message: 'connect ECONNREFUSED 10.0.0.1:443',
          },
        }),
      }),
      'Failed to fetch x',
    );

    expect(error.message).toBe(
      'Failed to fetch x. Reason: connect ECONNREFUSED 10.0.0.1:443.',
    );
  });

  it('skips an empty top-level message for the Backstage error body', async () => {
    const error = await k8sResponseError(
      failedResponse({
        status: 502,
        json: async () => ({
          message: '',
          error: { message: 'upstream reset' },
        }),
      }),
      'Failed to fetch x',
    );

    expect(error.message).toBe('Failed to fetch x. Reason: upstream reset.');
  });

  it('does not double the full stop of a message that already has one', async () => {
    const error = await k8sResponseError(
      failedResponse({
        status: 400,
        json: async () => ({
          message: 'admission webhook "x" denied the request: name is invalid.',
        }),
      }),
      'Failed to create x',
    );

    expect(error.message).toBe(
      'Failed to create x. Reason: admission webhook "x" denied the request: name is invalid.',
    );
  });

  it('falls back to the status code when there is no reason phrase', async () => {
    // HTTP/2 responses carry no reason phrase, and a proxied 404 may have no
    // body at all.
    const error = await k8sResponseError(
      failedResponse({ status: 404 }),
      'Failed to fetch x',
    );

    expect(error.message).toBe('Failed to fetch x. Reason: HTTP 404.');
  });

  it('includes the reason phrase when the body is not a Status object', async () => {
    const error = await k8sResponseError(
      failedResponse({
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => {
          throw new Error('not json');
        },
      }),
      'Failed to fetch x',
    );

    expect(error.message).toBe(
      'Failed to fetch x. Reason: HTTP 503 Service Unavailable.',
    );
  });

  it.each([
    [401, 'UnauthorizedError'],
    [403, 'ForbiddenError'],
    [404, 'NotFoundError'],
    [409, 'ConflictError'],
    [500, 'Error'],
  ])('names a %i %s', async (status, name) => {
    const error = await k8sResponseError(
      failedResponse({ status }),
      'Failed to fetch x',
    );

    expect(error.name).toBe(name);
  });

  describe('k8sResponseReason', () => {
    it('puts the status in front of a body message when asked to', async () => {
      await expect(
        k8sResponseReason(
          failedResponse({
            status: 401,
            json: async () => ({ kind: 'Status', message: 'Unauthorized' }),
          }),
          { withStatus: true },
        ),
      ).resolves.toBe('HTTP 401: Unauthorized');
    });

    it('is the status alone when the body has no message', async () => {
      await expect(
        k8sResponseReason(failedResponse({ status: 401 }), {
          withStatus: true,
        }),
      ).resolves.toBe('HTTP 401');
    });
  });
});
