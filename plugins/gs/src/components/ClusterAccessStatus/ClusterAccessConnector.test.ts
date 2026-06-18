import {
  classifyProbeError,
  classifyProbeResponse,
} from './ClusterAccessConnector';
import { ClusterTokenError } from '../../apis/auth/DefaultAuthConnector';

const MAX_RETRIES = 2;

describe('classifyProbeResponse', () => {
  it('treats a 2xx as healthy', () => {
    expect(
      classifyProbeResponse({ ok: true, status: 200 }, 0, MAX_RETRIES),
    ).toEqual({ kind: 'healthy' });
  });

  it('maps 401/403/404 to a degraded reason and does not retry', () => {
    expect(
      classifyProbeResponse({ ok: false, status: 403 }, 0, MAX_RETRIES),
    ).toEqual({ kind: 'degraded', reason: 'Access forbidden' });
    expect(
      classifyProbeResponse({ ok: false, status: 404 }, 0, MAX_RETRIES),
    ).toEqual({ kind: 'degraded', reason: 'API not found' });
  });

  it('retries a 5xx while attempts remain, then degrades', () => {
    expect(
      classifyProbeResponse({ ok: false, status: 503 }, 0, MAX_RETRIES),
    ).toEqual({ kind: 'retry' });
    expect(
      classifyProbeResponse(
        { ok: false, status: 503 },
        MAX_RETRIES,
        MAX_RETRIES,
      ),
    ).toEqual({ kind: 'degraded', reason: 'API request failed (503)' });
  });
});

describe('classifyProbeError', () => {
  it('skips a broker token error so the recorded state is not overwritten', () => {
    const error = new ClusterTokenError('golem', 'session-expired');
    expect(classifyProbeError(error, MAX_RETRIES, MAX_RETRIES)).toEqual({
      kind: 'skip',
    });
  });

  it('retries a transient error while attempts remain', () => {
    expect(classifyProbeError(new Error('boom'), 0, MAX_RETRIES)).toEqual({
      kind: 'retry',
    });
  });

  it('degrades a timeout once retries are exhausted', () => {
    expect(
      classifyProbeError(
        new Error('Request to cluster golem timed out after 10000ms'),
        MAX_RETRIES,
        MAX_RETRIES,
      ),
    ).toEqual({ kind: 'degraded', reason: 'API unreachable (timeout)' });
  });
});
