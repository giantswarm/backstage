import {
  elicitationHref,
  isOnOrigin,
  linkHost,
  originOf,
  returnedElicitationId,
} from './urlElicitation';

const MUSTER = 'https://muster.gazelle.example.io';
const BACK = 'https://portal.example.io/agents/sessions/gazelle/s1';

describe('urlElicitation', () => {
  it("reads muster's origin off its endpoint", () => {
    expect(originOf(`${MUSTER}/mcp`)).toBe(MUSTER);
    expect(originOf('not a url')).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
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

  it('trusts a link by its origin, never its path', () => {
    expect(isOnOrigin(`${MUSTER}/approvals/0f3c9a`, MUSTER)).toBe(true);
    expect(isOnOrigin(`${MUSTER}/anything/else`, MUSTER)).toBe(true);
    expect(
      isOnOrigin('https://other.example.io/approvals/0f3c9a', MUSTER),
    ).toBe(false);
    expect(isOnOrigin(`http://muster.gazelle.example.io/x`, MUSTER)).toBe(
      false,
    );
    expect(isOnOrigin(`${MUSTER}/x`, undefined)).toBe(false);
  });

  it('adds the return to a link on muster’s origin, keeping its own query', () => {
    const href = new URL(
      elicitationHref(`${MUSTER}/oauth/proxy/start?state=abc`, {
        musterOrigin: MUSTER,
        elicitationId: 'el-1',
        back: BACK,
      }),
    );
    expect(href.searchParams.get('state')).toBe('abc');
    const back = new URL(href.searchParams.get('redirect')!);
    expect(`${back.origin}${back.pathname}`).toBe(BACK);
    expect(back.searchParams.get('elicitationId')).toBe('el-1');
  });

  it('leaves any other link as sent', () => {
    const other = 'https://other.example.io/approvals/0f3c9a';
    expect(
      elicitationHref(other, {
        musterOrigin: MUSTER,
        elicitationId: 'el-1',
        back: BACK,
      }),
    ).toBe(other);
    expect(
      elicitationHref(`${MUSTER}/approvals/0f3c9a`, {
        musterOrigin: MUSTER,
        back: BACK,
      }),
    ).toBe(`${MUSTER}/approvals/0f3c9a`);
  });

  it('reads the elicitationId muster returned with', () => {
    expect(
      returnedElicitationId(new URLSearchParams('elicitationId=el-1')),
    ).toBe('el-1');
    expect(
      returnedElicitationId(
        new URLSearchParams('elicitationId=el-1&elicitationId=el-1'),
      ),
    ).toBe('el-1');
    expect(returnedElicitationId(new URLSearchParams(''))).toBeUndefined();
  });
});
