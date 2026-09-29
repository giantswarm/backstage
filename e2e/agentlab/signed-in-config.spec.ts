import { expect, test } from './fixtures';
import { lab } from './lab';

/**
 * The two tiers of configuration the portal ships to the browser: the
 * unauthenticated `index.html` carries only what the sign-in page needs, and
 * everything else a Giant Swarm plugin reads arrives after sign-in from the
 * authenticated `GET /api/gs/config` (docs/configuration.md, "What the
 * browser receives").
 */

/** The leaf paths of a JSON value; `[]` stands for an array's elements. */
function pathsOf(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[]`];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => pathsOf(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

/** The config the app-backend injected into the page, as the browser reads it. */
function publicConfigOf(html: string): Record<string, unknown> {
  const match = html.match(
    /type="backstage.io\/config"[^>]*>([\s\S]*?)<\/script>/,
  );
  expect(match, 'the page carries the config script').not.toBeNull();
  const decoded = match![1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const [first] = JSON.parse(decoded) as { data: Record<string, unknown> }[];
  return first.data;
}

/** The gs plugin's keys the sign-in page reads before anyone is signed in. */
const SIGN_IN_KEYS =
  /^gs\.(authProvider|auth\.scopes\[\]|auth\.extraScopes\[\]|signInProvider\.|signInFallbackProvider\.|github\.brokerAudience)/;

/** The Giant Swarm plugins whose config is read after sign-in only. */
const SIGNED_IN_PLUGINS =
  /^(muster|aiChat|agentPlatform|flux|plans|roadmap|repositories|platformCapabilities)\./;

test('the unauthenticated page carries only the sign-in config', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  const paths = pathsOf(publicConfigOf(html));

  expect(paths, 'the sign-in page has what it needs').toEqual(
    expect.arrayContaining([
      'app.baseUrl',
      'backend.baseUrl',
      'auth.environment',
      'gs.authProvider',
    ]),
  );
  expect(
    paths.filter(path => path.startsWith('gs.') && !SIGN_IN_KEYS.test(path)),
    'of the gs plugin only the sign-in keys are public',
  ).toEqual([]);
  expect(
    paths.filter(path => SIGNED_IN_PLUGINS.test(path)),
    'the other Giant Swarm plugins put nothing in the public config',
  ).toEqual([]);
});

test('the signed-in config needs a session and carries the installations', async ({
  admin,
  request,
}) => {
  const anonymous = await request.get('/api/gs/config');
  expect(anonymous.status(), 'no session, no config').toBe(401);

  // The loader fetches it once per app load, after the sign-in resolves; a
  // reload of the signed-in page shows the fetch.
  const response = admin.waitForResponse(
    r => r.url().endsWith('/api/gs/config') && r.request().method() === 'GET',
  );
  await admin.reload();
  const config = (await (await response).json()) as {
    gs: { installations: Record<string, { baseDomain?: string }> };
  };

  expect(
    Object.keys(config.gs.installations),
    'the installations map, backend-only in the schema, arrives signed in',
  ).toContain(lab.installation);
  expect(
    JSON.stringify(config),
    'nothing of the broker credentials or the muster endpoints travels',
  ).not.toMatch(/clientSecret|clientId|"url"|"headers"/);

  await expect(
    admin.getByRole('navigation', { name: 'sidebar nav' }),
    'the portal renders with the hydrated config',
  ).toBeAttached();
});
