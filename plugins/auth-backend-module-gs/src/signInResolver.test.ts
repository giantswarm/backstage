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

describe('customSignInResolver', () => {
  it('looks a Dex giantswarm-ad user up by email', async () => {
    const ctx = makeContext();

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-ad', user_id: 'u1' },
        email: 'user@giantswarm.io',
      },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
      filter: { 'spec.profile.email': 'user@giantswarm.io' },
    });
  });

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

  it('signs a giantswarm-github user without a username in by email', async () => {
    const ctx = makeContext();

    await resolve(
      {
        federated_claims: { connector_id: 'giantswarm-github', user_id: 'u4' },
        email: 'someone@giantswarm.io',
      },
      ctx,
    );

    expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: { sub: 'user:default/someone', ent: ['user:default/someone'] },
    });
  });

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
      },
      ctx,
    );

    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: { sub: 'user:default/guest', ent: ['user:default/guest'] },
    });
  });

  describe('identities from other connectors', () => {
    async function issuedRef(userinfo: object): Promise<string> {
      const ctx = makeContext();
      await resolve(userinfo, ctx);
      expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
      expect(ctx.issueToken).toHaveBeenCalledTimes(1);
      const { claims } = ctx.issueToken.mock.calls[0][0];
      expect(claims.ent).toEqual([claims.sub]);
      return claims.sub;
    }

    function customer(connectorId: string, userId: string, email: string) {
      return {
        federated_claims: { connector_id: connectorId, user_id: userId },
        email,
      };
    }

    it('never resolves into the namespace of the Giant Swarm catalog users', async () => {
      const ref = await issuedRef(
        customer('customer-ad', 'a1', 'alice@customer.com'),
      );

      expect(ref).not.toBe('user:default/alice');
      expect(parseEntityRef(ref).namespace).not.toBe('default');
    });

    it('resolves into a namespace named after the connector', async () => {
      const ref = await issuedRef(
        customer('customer-ad', 'a1', 'alice@customer.com'),
      );

      expect(ref).toBe('user:dex-customer-ad/a1');
    });

    it('keeps the same local part on two connectors apart', async () => {
      const first = await issuedRef(
        customer('customer-ad', 'alice', 'alice@customer.com'),
      );
      const second = await issuedRef(
        customer('partner-okta', 'alice', 'alice@customer.com'),
      );

      expect(first).not.toBe(second);
    });

    it('keeps two domains on one connector apart', async () => {
      const first = await issuedRef(
        customer('customer-ad', 'a1', 'alice@one.example'),
      );
      const second = await issuedRef(
        customer('customer-ad', 'a2', 'alice@two.example'),
      );

      expect(first).not.toBe(second);
    });

    it('resolves the same upstream user to the same ref when the email changes', async () => {
      const before = await issuedRef(
        customer('customer-ad', 'a1', 'alice@customer.com'),
      );
      const after = await issuedRef(
        customer('customer-ad', 'a1', 'alice.smith@customer.com'),
      );

      expect(after).toBe(before);
    });

    it.each([
      ['Customer_AD', 'CN=Alice,OU=People,DC=customer,DC=com'],
      ['customer.ad', 'alice@customer.com'],
      ['c'.repeat(80), 'u'.repeat(80)],
    ])(
      'issues a valid entity ref for connector %j and user %j',
      async (connectorId, userId) => {
        const ref = await issuedRef(customer(connectorId, userId, 'a@b.c'));
        const { kind, namespace, name } = parseEntityRef(ref);

        expect(kind).toBe('user');
        expect(KubernetesValidatorFunctions.isValidNamespace(namespace)).toBe(
          true,
        );
        expect(KubernetesValidatorFunctions.isValidObjectName(name)).toBe(true);
      },
    );

    it('keeps connectors apart that differ only in case or punctuation', async () => {
      const refs = await Promise.all(
        ['customer-ad', 'Customer-AD', 'customer.ad', 'customer_ad'].map(id =>
          issuedRef(customer(id, 'a1', 'alice@customer.com')),
        ),
      );

      expect(new Set(refs).size).toBe(refs.length);
    });

    it('keeps upstream users apart that differ only in case', async () => {
      const lower = await issuedRef(customer('customer-ad', 'abc', 'a@b.c'));
      const upper = await issuedRef(customer('customer-ad', 'ABC', 'a@b.c'));

      expect(lower.toLowerCase()).not.toBe(upper.toLowerCase());
    });

    it.each([
      ['an empty connector id', { connector_id: '', user_id: 'a1' }],
      ['no connector id', { user_id: 'a1' }],
      ['an empty user id', { connector_id: 'customer-ad', user_id: '' }],
      ['no user id', { connector_id: 'customer-ad' }],
    ])('refuses a Dex token with %s', async (_, federatedClaims) => {
      const ctx = makeContext();

      await expect(
        resolve(
          { federated_claims: federatedClaims, email: 'alice@customer.com' },
          ctx,
        ),
      ).rejects.toThrow(NotAllowedError);
      expect(ctx.issueToken).not.toHaveBeenCalled();
    });

    it('resolves a non-Dex identity by its subject outside the default namespace', async () => {
      const ref = await issuedRef({
        sub: 'f3c1e2d4-0000-4000-8000-000000000001',
        email: 'alice@customer.com',
      });

      expect(ref).toBe('user:oidc/f3c1e2d4-0000-4000-8000-000000000001');
    });

    it('refuses a non-Dex token without a subject', async () => {
      const ctx = makeContext();

      await expect(
        resolve({ email: 'alice@customer.com' }, ctx),
      ).rejects.toThrow(NotAllowedError);
      expect(ctx.issueToken).not.toHaveBeenCalled();
    });
  });
});
