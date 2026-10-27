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

  it.each(['giantswarm-simple-oidc', 'giantswarm-graveler-oidc'])(
    'looks a Dex %s user up by email',
    async connectorId => {
      const ctx = makeContext();

      await resolve(
        {
          sub: 'CgJ1MRIGc2ltcGxl',
          federated_claims: { connector_id: connectorId, user_id: 'u6' },
          email: 'user@giantswarm.io',
        },
        ctx,
      );

      expect(ctx.signInWithCatalogUser).toHaveBeenCalledWith({
        filter: { 'spec.profile.email': 'user@giantswarm.io' },
      });
      expect(ctx.issueToken).not.toHaveBeenCalled();
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

    it('keeps a subject that is a plain name readable', async () => {
      const ref = await issuedRef({
        sub: 'f3c1e2d4-0000-4000-8000-000000000001',
        email: 'alice@customer.com',
      });

      expect(ref).toBe('user:oidc/f3c1e2d4-0000-4000-8000-000000000001');
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
