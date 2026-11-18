import { describeTry } from './ServedModelLifecyclePanel';

describe('describeTry', () => {
  const result = (latencyMs: number) => ({
    url: 'https://models.example.com/v1',
    model: 'qwen',
    without: { status: 401 },
    with: { status: 200, content: 'pong', latencyMs },
  });

  it('gives a fast answer its milliseconds, not "0 s"', () => {
    expect(describeTry(result(420)).summary).toBe(
      '401 without a token · 200 as you in 420 ms — “pong”',
    );
  });

  it('gives a slow answer the platform duration format', () => {
    expect(describeTry(result(5321)).summary).toContain('200 as you in 5.3 s');
    expect(describeTry(result(150_000)).summary).toContain(
      '200 as you in 2 min 30 s',
    );
  });
});
