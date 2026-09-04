import { looksNotConnected } from './serverGateway';

describe('looksNotConnected', () => {
  it.each([
    'tool not found: x_github_list_pull_requests',
    'Unknown tool x_pro_list_issues',
    "Server 'github' is not connected",
    'Authentication required for github',
    'Server github requires authentication',
    // After any session connected the server, muster knows its tools and a
    // session without a grant fails on the connection instead.
    'Tool execution failed: failed to connect to server github: user not authenticated to server github',
  ])('recognises muster saying the session is not connected: %s', message => {
    expect(looksNotConnected(new Error(message))).toBe(true);
    expect(looksNotConnected(message)).toBe(true);
  });

  it.each([
    'Tool execution failed: 403 Resource not accessible by integration',
    'Tool execution failed: 404 Not Found',
    'fetch failed',
    'Server github not found in registry',
  ])('leaves other errors to the caller: %s', message => {
    expect(looksNotConnected(new Error(message))).toBe(false);
  });
});
