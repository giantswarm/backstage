import { ConfigReader } from '@backstage/config';
import { AuthLoginResult } from './authLogin';
import {
  asConnected,
  looksNotConnected,
  MusterServerGateway,
  MusterServerNotConnectedError,
  readMusterServerRef,
} from './serverGateway';

/** Muster's refusal to open a connection for a session without a grant. */
const NOT_AUTHENTICATED =
  'Tool execution failed: failed to connect to server github: user not authenticated to server github';

class FakeGateway implements MusterServerGateway {
  readonly server = 'github';
  logins = 0;
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };

  async call(): Promise<unknown> {
    throw new Error('not used');
  }

  async callContent() {
    return [];
  }

  async login() {
    this.logins++;
    return this.loginResult;
  }
}

describe('looksNotConnected', () => {
  it.each([
    'tool not found: x_github_list_pull_requests',
    'Unknown tool: x_pro_list_issues',
    NOT_AUTHENTICATED,
    'Authentication required for github.',
    'server pro requires authentication',
    'session is not connected to server pro',
  ])('recognises muster answering %j', message => {
    expect(looksNotConnected(new Error(message))).toBe(true);
  });

  it("leaves the server's own failures alone", () => {
    expect(looksNotConnected(new Error('GitHub responded with 500'))).toBe(
      false,
    );
    expect(
      looksNotConnected(
        new Error('Tool execution failed: 403 Resource not accessible'),
      ),
    ).toBe(false);
  });

  it('reads non-Error throwables as their text', () => {
    expect(looksNotConnected('tool not found: x_github_get_me')).toBe(true);
    expect(looksNotConnected({ code: 500 })).toBe(false);
  });
});

describe('asConnected', () => {
  let gateway: FakeGateway;

  beforeEach(() => {
    gateway = new FakeGateway();
  });

  it('passes a successful call through without a login', async () => {
    await expect(
      asConnected(gateway, 'github', 'token', async () => 'ok'),
    ).resolves.toBe('ok');
    expect(gateway.logins).toBe(0);
  });

  it('connects and retries once when the person already consented', async () => {
    let attempts = 0;
    const run = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error(NOT_AUTHENTICATED);
      }
      return 'ok';
    };

    await expect(asConnected(gateway, 'github', 'token', run)).resolves.toBe(
      'ok',
    );
    expect(gateway.logins).toBe(1);
    expect(attempts).toBe(2);
  });

  it('throws MusterServerNotConnectedError with the sign-in URL when a consent is needed', async () => {
    gateway.loginResult = {
      status: 'auth_required',
      authUrl: 'https://muster.example/oauth/proxy/start?state=x',
      message: 'Authentication required for github.',
    };

    const error = await asConnected(gateway, 'github', 'token', async () => {
      throw new Error(NOT_AUTHENTICATED);
    }).catch(e => e);

    expect(error).toBeInstanceOf(MusterServerNotConnectedError);
    expect(error.name).toBe('MusterServerNotConnectedError');
    expect(error.server).toBe('github');
    expect(error.authUrl).toBe(
      'https://muster.example/oauth/proxy/start?state=x',
    );
    expect(error.message).toMatch(/Connect 'github'/);
    expect(gateway.logins).toBe(1);
  });

  it('does not mistake other failures for a missing grant', async () => {
    const error = await asConnected(gateway, 'github', 'token', async () => {
      throw new Error('GitHub responded with 500');
    }).catch(e => e);

    expect(error.message).toBe('GitHub responded with 500');
    expect(gateway.logins).toBe(0);
  });
});

describe('readMusterServerRef', () => {
  it('reads <key>.muster with the server name as the default tool prefix', () => {
    const config = new ConfigReader({
      plans: { muster: { installation: 'gazelle', server: 'github' } },
    });
    expect(readMusterServerRef(config, 'plans')).toEqual({
      installation: 'gazelle',
      server: 'github',
      toolPrefix: 'github',
    });
  });

  it('keeps an explicit tool prefix', () => {
    const config = new ConfigReader({
      roadmap: {
        muster: {
          installation: 'gazelle',
          server: 'gazelle-mcp-pro',
          toolPrefix: 'pro',
        },
      },
    });
    expect(readMusterServerRef(config, 'roadmap')?.toolPrefix).toBe('pro');
  });

  it('is undefined when the plugin is not wired to muster', () => {
    expect(readMusterServerRef(new ConfigReader({}), 'plans')).toBeUndefined();
  });
});
