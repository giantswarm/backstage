import type { APIResponse, Page, Response } from '@playwright/test';
import { expect } from './fixtures';
import { lab, type LabUser } from './lab';

/**
 * The portal's muster routes (`/api/muster/...`) as one person, with the
 * tokens the person's signed-in page holds, so muster sees the forwarded
 * identity exactly as it does for the portal's pages.
 */

const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

type Tokens = { backstage: string; muster: string };

/**
 * The portal's tokens for the person signed in on `page`, read from the
 * app's own silent sign-in while `navigate` runs: the refresh answer of the
 * sign-in provider carries the Backstage identity token and the provider's
 * ID token, which the muster plugin sends to the home muster
 * (`backstage-muster-authorization`). No extra refresh is made: Dex rotates
 * the refresh token on every one, and the page's own stays the only one.
 */
async function capturePortalTokens(
  page: Page,
  navigate: () => Promise<void>,
): Promise<Tokens> {
  let found: Tokens | undefined;
  const reads: Promise<void>[] = [];
  const onResponse = (response: Response) => {
    if (!/\/api\/auth\/[^/]+\/refresh/.test(response.url()) || !response.ok()) {
      return;
    }
    reads.push(
      response
        .json()
        .then(body => {
          const backstage = body?.backstageIdentity?.token;
          const muster = body?.providerInfo?.idToken;
          if (!found && typeof backstage === 'string' && muster) {
            found = { backstage, muster };
          }
        })
        .catch(() => undefined),
    );
  };
  page.on('response', onResponse);
  try {
    await navigate();
    await expect
      .poll(
        async () => {
          await Promise.all(reads);
          return found !== undefined;
        },
        {
          timeout: 30_000,
          message:
            "the app's sign-in refresh named no Backstage identity and ID token",
        },
      )
      .toBe(true);
  } finally {
    page.off('response', onResponse);
  }
  return found!;
}

/** The portal's muster routes as the person signed in on {@link page}. */
export class MusterRoute {
  private tokens?: Tokens;

  constructor(
    readonly page: Page,
    readonly user: LabUser,
  ) {}

  /** Reads the tokens from a page load (the page is left on `/`). */
  private async refreshTokens(): Promise<void> {
    this.tokens = await capturePortalTokens(this.page, async () => {
      await this.page.goto('/');
    });
  }

  /**
   * One GET to the portal's muster routes as the person, against the lab's
   * installation; a 401 (a token expired mid-run) is retried once with fresh
   * tokens.
   */
  private async get(path: string): Promise<APIResponse> {
    const send = async () => {
      if (!this.tokens) {
        await this.refreshTokens();
      }
      return this.page.request.get(
        `/api/muster${path}?installation=${encodeURIComponent(lab.installation)}`,
        {
          headers: {
            Authorization: `Bearer ${this.tokens!.backstage}`,
            [MUSTER_AUTH_HEADER]: this.tokens!.muster,
          },
          timeout: 60_000,
        },
      );
    };
    const response = await send();
    if (response.status() !== 401) {
      return response;
    }
    this.tokens = undefined;
    return send();
  }

  /** The MCP servers the person's muster aggregates, with their state. */
  async listServers(): Promise<{ name: string; state?: string }[]> {
    const response = await this.get('/servers');
    expect(
      response.ok(),
      `the portal lists muster's servers for ${this.user.email} (${response.status()})`,
    ).toBe(true);
    const body = await response.json();
    return body?.mcpServers ?? [];
  }
}
