import {
  bounceAllowed,
  bounceToConnect,
  ROADMAP_CONNECT_BOUNCE_KEY,
  recordBounce,
  withRedirectBack,
} from './connectBounce';

describe('connectBounce', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("appends the redirect target to muster's connect URL", () => {
    const url = new URL(
      withRedirectBack(
        'https://muster.example.com/oauth/proxy/start?state=abc',
        'https://portal/roadmap?repo=x',
      ),
    );
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('redirect')).toBe(
      'https://portal/roadmap?repo=x',
    );
  });

  it('allows a first bounce, refuses a second one right after, allows it again later', () => {
    expect(bounceAllowed(1_000_000)).toBe(true);
    recordBounce(1_000_000);
    expect(bounceAllowed(1_000_000 + 30_000)).toBe(false);
    expect(bounceAllowed(1_000_000 + 3 * 60_000)).toBe(true);
    expect(window.sessionStorage.getItem(ROADMAP_CONNECT_BOUNCE_KEY)).toBe(
      '1000000',
    );
  });

  it('asks to open the connect URL with the current page as redirect and records the bounce on accept', async () => {
    const open = jest.fn().mockResolvedValue('accept');

    await bounceToConnect(
      { open },
      'https://muster.example.com/oauth/proxy/start?state=abc',
      'https://portal/roadmap',
    );

    expect(
      new URL(open.mock.calls[0][0].url).searchParams.get('redirect'),
    ).toBe('https://portal/roadmap');
    expect(bounceAllowed()).toBe(false);
  });

  it('records nothing when the person does not open it', async () => {
    await bounceToConnect(
      { open: jest.fn().mockResolvedValue('cancel') },
      'https://muster.example.com/oauth/proxy/start?state=abc',
      'https://portal/roadmap',
    );

    expect(bounceAllowed()).toBe(true);
  });
});
