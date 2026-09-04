import { looksNotConnected } from './github';

describe('looksNotConnected', () => {
  it.each([
    'tool not found: x_github_list_pull_requests',
    "Server 'github' is not connected",
    'Authentication required for github',
    // After any session connected the server, muster knows its tools and a
    // session without a grant fails on the connection instead.
    'Tool execution failed: failed to connect to server github: user not authenticated to server github',
  ])('recognises muster saying the session is not connected: %s', message => {
    expect(looksNotConnected(new Error(message))).toBe(true);
  });

  it.each([
    'Tool execution failed: 403 Resource not accessible by integration',
    'fetch failed',
  ])('leaves other errors to the caller: %s', message => {
    expect(looksNotConnected(new Error(message))).toBe(false);
  });
});
