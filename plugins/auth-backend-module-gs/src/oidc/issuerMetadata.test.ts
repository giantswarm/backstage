import { LoggerService } from '@backstage/backend-plugin-api';
import fetch from 'node-fetch';
import { waitForIssuerMetadata } from './issuerMetadata';

jest.mock('node-fetch', () => jest.fn());

const mockFetch = fetch as unknown as jest.Mock;

const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as unknown as LoggerService;

const METADATA_URL =
  'https://dex.example.gigantic.io/.well-known/openid-configuration';

const sleep = jest.fn().mockResolvedValue(undefined);

describe('waitForIssuerMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves when the metadata endpoint responds ok', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, { sleep }),
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with exponential backoff and resolves once the endpoint recovers', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ ok: true });

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        initialDelayMs: 100,
      }),
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('treats non-ok responses as failures', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        attempts: 2,
      }),
    ).rejects.toThrow(
      'Failed to fetch issuer metadata for oidc-example auth provider after 2 attempts: Error: 502 Bad Gateway',
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        attempts: 3,
      }),
    ).rejects.toThrow('after 3 attempts');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // retry attempts are expected outcomes and must not reach Sentry
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
