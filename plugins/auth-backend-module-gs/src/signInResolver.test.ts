import {
  KubernetesValidatorFunctions,
  parseEntityRef,
} from '@backstage/catalog-model';
import { NotAllowedError } from '@backstage/errors';
import { AuthResolverContext } from '@backstage/plugin-auth-node';
import { customSignInResolver } from './signInResolver';

type ResolverInfo = Parameters<typeof customSignInResolver>[0];

function makeInfo(userinfo: object): ResolverInfo {
  return {
    result: { fullProfile: { userinfo } },
  } as unknown as ResolverInfo;
}

function makeContext() {
  return {
    issueToken: jest.fn().mockResolvedValue({ token: 'issued' }),
    signInWithCatalogUser: jest.fn().mockResolvedValue({ token: 'catalog' }),
  };
}

function resolve(userinfo: object, ctx: ReturnType<typeof makeContext>) {
  return customSignInResolver(
    makeInfo(userinfo),
    ctx as unknown as AuthResolverContext,
  );
}

/** A Dex `sub`: base64url of `IDTokenSubject { user_id = 1; conn_id = 2; }`. */
function dexSubject(userId: string, connectorId: string): string {
  const field = (tag: number, value: string) => {
    const bytes = Buffer.from(value, 'utf8');
    const length: number[] = [];
    let rest = bytes.length;
    while (rest > 0x7f) {
      length.push((rest & 0x7f) | 0x80);
      rest >>= 7;
    }
    length.push(rest);
    return Buffer.concat([Buffer.from([tag, ...length]), bytes]);
  };
  return Buffer.concat([
    field(0x0a, userId),
    field(0x12, connectorId),
  ]).toString('base64url');
}

describe('customSignInResolver', () => {
  it('looks a Dex giantswarm-ad user up by email', async () => {
    const ctx = makeContext();

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-ad', user_id: 'u1' },
        email: 'user@giantswarm.io',
        email_verified: true,
      },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      filter: { 'spec.profile.email': 'user@giantswarm.io' },
    });
  });

  describe.each(['giantswarm-simple-oidc', 'giantswarm-graveler-oidc'])(
    'a person federated through %s',
    federatingConnector => {
      function federated(upstreamSubject: string, userinfo: object) {
        return {
          sub: dexSubject(upstreamSubject, federatingConnector),
          federated_claims: {
            connector_id: federatingConnector,
            user_id: upstreamSubject,
          },
          ...userinfo,
        };
      }

      it('is looked up by email after giantswarm-ad upstream', async () => {
        const ctx = makeContext();

        await resolve(
          federated(dexSubject('u6', 'giantswarm-ad'), {
            email: 'user@giantswarm.io',
            email_verified: true,
          }),
          ctx,
        );

        expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
          filter: { 'spec.profile.email': 'user@giantswarm.io' },
        });
        expect(ctx.issueToken).not.toHaveBeenCalled();
      });

      it('is looked up by username after giantswarm-github upstream, whatever the email', async () => {
        const ctx = makeContext();

        await resolve(
          federated(dexSubject('1234567', 'giantswarm-github'), {
            email: 'someone@gmail.com',
            preferred_username: 'someone',
          }),
          ctx,
        );

        expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
          filter: { 'metadata.name': 'someone' },
        });
        expect(ctx.issueToken).not.toHaveBeenCalled();
      });

      it('reads an upstream subject longer than 127 bytes', async () => {
        const ctx = makeContext();

        await resolve(
          federated(dexSubject('u'.repeat(200), 'giantswarm-ad'), {
            email: 'user@giantswarm.io',
            email_verified: true,
          }),
          ctx,
        );

        expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
          filter: { 'spec.profile.email': 'user@giantswarm.io' },
        });
      });

      it.each([
        ['another upstream connector', dexSubject('a1', 'customer-ad')],
        ['an upstream subject that is not a Dex subject', 'not a dex subject'],
      ])('is not looked up in the catalog after %s', async (_, upstream) => {
        const ctx = makeContext();

        await resolve(
          federated(upstream, { email: 'user@giantswarm.io' }),
          ctx,
        );

        expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
        const { claims } = ctx.issueToken.mock.calls[0][0];
        expect(parseEntityRef(claims.sub).namespace).toBe('oidc');
      });
    },
  );

  it('looks a Dex giantswarm-github user up by username', async () => {
    const ctx = makeContext();

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-github', user_id: 'u2' },
        preferred_username: 'someone',
      },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      filter: { 'metadata.name': 'someone' },
    });
  });

  it('looks a giantswarm-github user without a username up by email', async () => {
    const ctx = makeContext();

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-github', user_id: 'u4' },
        email: 'someone@giantswarm.io',
        email_verified: true,
      },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      filter: { 'spec.profile.email': 'someone@giantswarm.io' },
    });
  });

  it.each([
    ['without email_verified', {}],
    ['with email_verified false', { email_verified: false }],
  ])(
    'falls back to the guest user when a giantswarm-ad email is %s',
    async (_, verified) => {
      const ctx = makeContext();

      await resolve(
        {
          federated_claims: { connector_id: 'giantswarm-ad', user_id: 'u7' },
          email: 'user@giantswarm.io',
          ...verified,
        },
        ctx,
      );

      expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
      expect(ctx.issueToken).toHaveBeenCalledWith({
        claims: { sub: 'user:default/guest', ent: ['user:default/guest'] },
      });
    },
  );

  it('falls back to the guest user when a giantswarm-ad token carries no email', async () => {
    const ctx = makeContext();

    await resolve(
      { federated_claims: { connector_id: 'giantswarm-ad', user_id: 'u5' } },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: { sub: 'user:default/guest', ent: ['user:default/guest'] },
    });
  });

  it('falls back to the guest user when the catalog lookup fails', async () => {
    const ctx = makeContext();
    ctx.signInWithCatalogUser.mockRejectedValue(new Error('not found'));

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-ad', user_id: 'u3' },
        email: 'user@giantswarm.io',
        email_verified: true,
      },
      ctx,
    );

    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: { sub: 'user:default/guest', ent: ['user:default/guest'] },
    });
  });

  describe('identities from other connectors and issuers', () => {
    async function issuedRef(userinfo: object): Promise<string> {
      const ctx = makeContext();
      await resolve(userinfo, ctx);
      expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
      expect(ctx.issueToken).toHaveBeenCalledTimes(1);
      const { claims } = ctx.issueToken.mock.calls[0][0];
      expect(claims.ent).toEqual([claims.sub]);
      return claims.sub;
    }

    function customer(sub: string, email: string) {
      return {
        sub,
        federated_claims: { connector_id: 'customer-ad', user_id: 'a1' },
        email,
      };
    }

    it('never resolves into the namespace of the Giant Swarm catalog users', async () => {
      const ref = await issuedRef(
        customer('CgJhMRILY3VzdG9tZXItYWQ', 'alice@customer.com'),
      );

      expect(ref).not.toBe('user:default/alice');
      expect(parseEntityRef(ref).namespace).toBe('oidc');
    });

    it('keeps two subjects with the same email local part apart', async () => {
      const first = await issuedRef(
        customer('CgJhMRILY3VzdG9tZXItYWQ', 'alice@one.example'),
      );
      const second = await issuedRef(
        customer('CgJhMRIMcGFydG5lci1va3Rh', 'alice@two.example'),
      );

      expect(first).not.toBe(second);
    });

    it('resolves the same subject to the same ref when the email changes', async () => {
      const before = await issuedRef(
        customer('CgJhMRILY3VzdG9tZXItYWQ', 'alice@customer.com'),
      );
      const after = await issuedRef(
        customer('CgJhMRILY3VzdG9tZXItYWQ', 'alice.smith@customer.com'),
      );

      expect(after).toBe(before);
    });

    it('keeps subjects apart that differ only in case', async () => {
      const lower = await issuedRef(customer('abc', 'a@b.c'));
      const upper = await issuedRef(customer('ABC', 'a@b.c'));

      expect(lower.toLowerCase()).not.toBe(upper.toLowerCase());
    });

    it.each([
      'CgJhMRILY3VzdG9tZXItYWQ',
      'CN=Alice,OU=People/Users,DC=customer:com',
      's'.repeat(80),
    ])('issues a valid entity ref for subject %j', async sub => {
      const ref = await issuedRef(customer(sub, 'a@b.c'));
      const { kind, namespace, name } = parseEntityRef(ref);

      expect(kind).toBe('user');
      expect(namespace).toBe('oidc');
      expect(KubernetesValidatorFunctions.isValidObjectName(name)).toBe(true);
    });

    it.each([
      ['a Dex token without a subject', customer('', 'alice@customer.com')],
      ['a non-Dex token without a subject', { email: 'alice@customer.com' }],
    ])('refuses %s', async (_, userinfo) => {
      const ctx = makeContext();

      await expect(resolve(userinfo, ctx)).rejects.toThrow(NotAllowedError);
      expect(ctx.issueToken).not.toHaveBeenCalled();
    });
  });
});
