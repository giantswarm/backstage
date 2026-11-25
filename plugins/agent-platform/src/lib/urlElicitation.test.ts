import {
  elicitationHref,
  linkHost,
  musterPageKind,
  musterPagesOf,
  newReturnNonce,
  returnedElicitation,
} from './urlElicitation';

const MUSTER = 'https://muster.gazelle.example.io';
const PAGES = { origin: MUSTER, basePath: '' };
const BACK = 'https://portal.example.io/agents/sessions/gazelle/s1';

describe('urlElicitation', () => {
  it('reads where muster serves its pages off its public URL or endpoint', () => {
    expect(musterPagesOf(`${MUSTER}/mcp`)).toEqual(PAGES);
    expect(musterPagesOf(`${MUSTER}/`)).toEqual(PAGES);
    expect(musterPagesOf('https://example.io/muster')).toEqual({
      origin: 'https://example.io',
      basePath: '/muster',
    });
    expect(musterPagesOf('not a url')).toBeUndefined();
    expect(musterPagesOf(undefined)).toBeUndefined();
  });

  it('names the host a link leads to, for http(s) only', () => {
    expect(linkHost(`${MUSTER}/approvals/0f3c9a`)).toBe(
      'muster.gazelle.example.io',
    );
    expect(linkHost('https://muster.example.io:8443/x')).toBe(
      'muster.example.io:8443',
    );
    expect(linkHost('ftp://muster.example.io/x')).toBeUndefined();
  });

  it("knows muster's returning pages by origin and path, and no other path", () => {
    expect(musterPageKind(`${MUSTER}/approvals/0F3C9A26`, PAGES)).toBe(
      'approval',
    );
    expect(musterPageKind(`${MUSTER}/oauth/proxy/start?state=abc`, PAGES)).toBe(
      'sign-in',
    );
    expect(musterPageKind(`${MUSTER}/anything/else`, PAGES)).toBeUndefined();
    expect(musterPageKind(`${MUSTER}/oauth/authorize`, PAGES)).toBeUndefined();
    expect(
      musterPageKind(`${MUSTER}/approvals/0f3c9a/extra`, PAGES),
    ).toBeUndefined();
    expect(musterPageKind(`${MUSTER}/approvals/`, PAGES)).toBeUndefined();
    expect(
      musterPageKind('https://other.example.io/approvals/0f3c9a', PAGES),
    ).toBeUndefined();
    expect(musterPageKind(`${MUSTER}/approvals/0f3c9a`, undefined)).toBe(
      undefined,
    );
    const prefixed = { origin: MUSTER, basePath: '/muster' };
    expect(musterPageKind(`${MUSTER}/muster/approvals/0f3c9a`, prefixed)).toBe(
      'approval',
    );
    expect(
      musterPageKind(`${MUSTER}/approvals/0f3c9a`, prefixed),
    ).toBeUndefined();
  });

  // The security review's PoC (reviews/m1/poc/bs_url_poc.mjs), against the
  // module itself: none of these is one of muster's returning pages.
  it.each([
    'https://MUSTER.example.com:443/x',
    'https://muster.example.com@evil.example/approvals/abc',
    'https://evil.example\\.muster.example.com/approvals/abc',
    'https://evil.example#@muster.example.com/approvals/abc',
    'https://muster.example.com.evil.example/approvals/abc',
    'http://muster.example.com/approvals/abc',
    'https://muster.example.com/oauth/authorize?client_id=x',
    'https://mуster.example.com/approvals/abc',
    // A script URL, spelled apart so the linter does not take it for one.
    `${'javascript'}:alert(1)//muster.example.com/approvals/abc`,
  ])('gives %j no return', url => {
    const pages = { origin: 'https://muster.example.com', basePath: '' };
    expect(musterPageKind(url, pages)).toBeUndefined();
    expect(
      elicitationHref(url, {
        musterPages: pages,
        elicitationId: 'e&id=1#x',
        nonce: 'n',
        back: BACK,
      }),
    ).toBe(url);
  });

  it.each([
    'https://muster.example.com/approvals/abc',
    'https://MUSTER.example.com:443/approvals/abc',
  ])('gives %j, muster’s approval page, a return', url => {
    const pages = { origin: 'https://muster.example.com', basePath: '' };
    expect(musterPageKind(url, pages)).toBe('approval');
  });

  it("returns from the approval page with this open's value; muster names the elicitation", () => {
    const href = new URL(
      elicitationHref(
        `${MUSTER}/approvals/0f3c9a?redirect=https://portal.example.io/other&elicitationId=zz`,
        {
          musterPages: PAGES,
          elicitationId: 'el-1',
          nonce: 'n-1',
          back: BACK,
        },
      ),
    );
    const back = new URL(href.searchParams.get('redirect')!);
    expect(`${back.origin}${back.pathname}`).toBe(BACK);
    expect(back.searchParams.get('elicitationReturn')).toBe('n-1');
    // Not the relayed id: a return counts only with the one muster sets.
    expect(back.searchParams.get('elicitationId')).toBeNull();
  });

  it('returns from the sign-in start naming the elicitation, keeping its own query', () => {
    const href = new URL(
      elicitationHref(`${MUSTER}/oauth/proxy/start?state=abc`, {
        musterPages: PAGES,
        elicitationId: 'e&id=1#x',
        nonce: 'n-1',
        back: BACK,
      }),
    );
    expect(href.searchParams.get('state')).toBe('abc');
    const back = new URL(href.searchParams.get('redirect')!);
    expect(back.searchParams.get('elicitationId')).toBe('e&id=1#x');
    expect(back.searchParams.get('elicitationReturn')).toBe('n-1');
  });

  it('leaves a link without an elicitationId as sent', () => {
    expect(
      elicitationHref(`${MUSTER}/approvals/0f3c9a`, {
        musterPages: PAGES,
        nonce: 'n',
        back: BACK,
      }),
    ).toBe(`${MUSTER}/approvals/0f3c9a`);
  });

  it('reads a return only with both the elicitation and the open’s value', () => {
    expect(
      returnedElicitation(
        new URLSearchParams('elicitationId=el-1&elicitationReturn=n-1'),
      ),
    ).toEqual({ elicitationId: 'el-1', nonce: 'n-1' });
    expect(
      returnedElicitation(new URLSearchParams('elicitationId=el-1')),
    ).toBeUndefined();
    expect(
      returnedElicitation(new URLSearchParams('elicitationReturn=n-1')),
    ).toBeUndefined();
  });

  it('makes a new 128-bit value per open', () => {
    const a = newReturnNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newReturnNonce()).not.toBe(a);
  });
});
