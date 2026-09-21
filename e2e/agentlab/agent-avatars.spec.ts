import { Response } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Agent avatars as the portal loads them: same-origin `<img>` requests to the
 * agent-platform backend, authenticated by the plugin's user cookie, under a
 * Content-Security-Policy that names no installation.
 *
 * The lab runs no avatar renderer (its edge lacks the route's rewrite filter),
 * so the backend answers each avatar with an error and the portal shows the
 * initials; what the lab proves is the path, the cookie and the header. That
 * an avatar renders through the proxy is proven on an installation with the
 * renderer.
 */

test('avatars are requested from the portal’s origin with the backend’s cookie, under a CSP naming no avatar host', async ({
  admin,
}) => {
  const origin = new URL(lab.baseURL).origin;
  const avatars: { url: string; status: number }[] = [];
  const cookie: number[] = [];
  const record = (response: Response) => {
    const url = response.url();
    if (url.includes('/api/agent-platform/avatars/')) {
      avatars.push({ url, status: response.status() });
    }
    if (url.endsWith('/api/agent-platform/.backstage/auth/v1/cookie')) {
      cookie.push(response.status());
    }
  };
  admin.on('response', record);

  // The New agent wizard's live preview requests an avatar for whatever is
  // typed, so the proof needs no agent on the installation.
  await open(admin, '/agent-platform/agents/new');
  await expect(admin.getByText('Step 1 of 4: Details')).toBeVisible();
  await admin.getByRole('textbox', { name: 'Name' }).fill('Avatar Probe');
  await expect(admin.getByRole('textbox', { name: 'Slug' })).toHaveValue(
    'avatar-probe',
  );
  await expect
    .poll(() => avatars.length, {
      message: 'the preview requested its avatar',
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  admin.off('response', record);

  expect(cookie, 'the backend issued its user cookie').toContain(200);
  for (const { url, status } of avatars) {
    expect(new URL(url).origin, 'loaded from the portal’s origin').toBe(origin);
    expect(url).toMatch(
      /\/api\/agent-platform\/avatars\/[^/]+\/v1\/preview\/128\/avatar-probe\.png$/,
    );
    expect([401, 403], 'the cookie authenticates the image load').not.toContain(
      status,
    );
  }
  test.info().annotations.push({
    type: 'avatar responses',
    description: avatars.map(a => `${a.status} ${a.url}`).join('\n'),
  });

  // The header the unauthenticated page carries, on the portal's front door.
  const shell = await admin.request.get(lab.baseURL);
  const csp = shell.headers()['content-security-policy'] ?? '';
  expect(csp, 'the portal sends a Content-Security-Policy').toContain(
    'img-src',
  );
  expect(csp, 'no installation host in the policy').not.toMatch(/avatars\./);

  await admin.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(admin).toHaveURL(/\/agent-platform\/agents$/);
});
