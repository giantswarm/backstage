import type { Request, Route } from '@playwright/test';
import { expect, open, openHome, test } from './fixtures';

/**
 * Pages that call muster tools on their own -- the home's agent roster, the
 * Agents and Models lists, their polls -- never put a page to the person:
 * their calls declare no URL elicitation, so a sign-in they need is muster's
 * 401 and the page's inline sign-in, not the consent dialog.
 *
 * muster is staged to answer every call that declares URL elicitation with
 * `input_required` for a sign-in page, as it does for a person who holds no
 * grant for the server; a call that declares none goes to the lab muster
 * unchanged. Whatever grants the lab user holds, no dialog may open.
 */

const MUSTER_CALL = '**/api/muster/call**';
const SETTLE_MS = 20_000;

type CallBody = { name?: string; urlElicitation?: boolean };

const declaresUrlElicitation = (request: Request) =>
  (request.postDataJSON() as CallBody | null)?.urlElicitation !== false;

test('pages that read muster tools on their own open no consent dialog', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  const calls: CallBody[] = [];
  const inputRequired = async (route: Route) => {
    const body = route.request().postDataJSON() as CallBody | null;
    calls.push(body ?? {});
    if (!declaresUrlElicitation(route.request())) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      json: {
        error: {
          name: 'MusterInputRequiredError',
          message: 'Sign in to agent-manager to continue.',
          elicitations: [
            {
              key: 'muster_sign_in',
              url: 'https://muster.invalid/oauth/proxy/start?state=staged',
              message: 'Sign in to agent-manager to continue.',
            },
          ],
          requestState: 'staged',
        },
      },
    });
  };
  await admin.route(MUSTER_CALL, inputRequired);
  const consent = admin.getByRole('dialog', { name: /^Open a page for / });

  try {
    await openHome(admin);
    await open(admin, '/customize/agents');
    await open(admin, '/customize/models');
    await expect
      .poll(() => calls.length, {
        message: 'the pages called muster tools',
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    // Long enough for the lists' polls to run again.
    await admin.waitForTimeout(SETTLE_MS);

    await expect(consent, 'no page is put to the person').toHaveCount(0);
    expect(
      calls.filter(call => call.urlElicitation !== false),
      'every call the pages made on their own declares no URL elicitation',
    ).toEqual([]);
  } finally {
    await admin.unroute(MUSTER_CALL, inputRequired);
  }
});
