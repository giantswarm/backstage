import type { LoggerService } from '@backstage/backend-plugin-api';
import { connectWithRetry } from './database';

type Client = Awaited<ReturnType<Parameters<typeof connectWithRetry>[0]>>;

// A clock the injected sleep advances, so the deadline is reached without
// waiting for it.
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: jest.fn(async (ms: number) => {
      time += ms;
    }),
  };
}

const client = {} as Client;

function mockLogger() {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

const refused = new Error('connect ECONNREFUSED 10.96.0.10:5432');

describe('connectWithRetry', () => {
  it('returns the first attempt that connects', async () => {
    const clock = fakeClock();
    const connect = jest
      .fn<Promise<Client>, []>()
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(refused)
      .mockResolvedValue(client);
    const logger = mockLogger();

    await expect(
      connectWithRetry(connect, {
        deadlineMs: 60_000,
        delayMs: 5_000,
        logger: logger as unknown as LoggerService,
        ...clock,
      }),
    ).resolves.toBe(client);

    expect(connect).toHaveBeenCalledTimes(3);
    expect(clock.sleep).toHaveBeenCalledWith(5_000);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      'Database reachable after 3 attempts',
    );
  });

  it('does not log a first attempt that connects', async () => {
    const logger = mockLogger();

    await connectWithRetry(async () => client, {
      deadlineMs: 60_000,
      delayMs: 5_000,
      logger: logger as unknown as LoggerService,
      ...fakeClock(),
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rethrows the last error once the deadline passes', async () => {
    const clock = fakeClock();
    const connect = jest.fn<Promise<Client>, []>().mockRejectedValue(refused);
    const logger = mockLogger();

    await expect(
      connectWithRetry(connect, {
        deadlineMs: 20_000,
        delayMs: 5_000,
        logger: logger as unknown as LoggerService,
        ...clock,
      }),
    ).rejects.toBe(refused);

    // Attempts at 0, 5, 10 and 15 s; a fifth would start at the deadline.
    expect(connect).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledWith(
      'Database unreachable, giving up after 4 attempts',
      refused,
    );
  });
});
