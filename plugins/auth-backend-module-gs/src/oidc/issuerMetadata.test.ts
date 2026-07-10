import { LoggerService } from '@backstage/backend-plugin-api';
import { Issuer } from 'openid-client';
import { waitForIssuerMetadata } from './issuerMetadata';

jest.mock('openid-client', () => ({
  Issuer: { discover: jest.fn() },
}));

const mockDiscover = Issuer.discover as jest.Mock;

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

  it('resolves when issuer discovery succeeds', async () => {
    mockDiscover.mockResolvedValue({});

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, { sleep }),
    ).resolves.toBeUndefined();

    expect(mockDiscover).toHaveBeenCalledTimes(1);
    expect(mockDiscover).toHaveBeenCalledWith(METADATA_URL);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with exponential backoff and resolves once discovery recovers', async () => {
    mockDiscover
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({});

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        initialDelayMs: 100,
      }),
    ).resolves.toBeUndefined();

    expect(mockDiscover).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('surfaces the last discovery error after exhausting all attempts', async () => {
    mockDiscover.mockRejectedValue(
      new Error('expected 200 OK, got: 502 Bad Gateway'),
    );

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        attempts: 2,
      }),
    ).rejects.toThrow(
      'Failed to fetch issuer metadata for oidc-example auth provider after 2 attempts: Error: expected 200 OK, got: 502 Bad Gateway',
    );

    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    mockDiscover.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      waitForIssuerMetadata('oidc-example', METADATA_URL, logger, {
        sleep,
        attempts: 3,
      }),
    ).rejects.toThrow('after 3 attempts');

    expect(mockDiscover).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // retry attempts are expected outcomes and must not reach Sentry
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('fails immediately on a malformed metadataUrl without retrying', async () => {
    await expect(
      waitForIssuerMetadata(
        'oidc-example',
        'dex.example.gigantic.io/.well-known/openid-configuration',
        logger,
        { sleep },
      ),
    ).rejects.toThrow('Invalid URL');

    expect(mockDiscover).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
});
