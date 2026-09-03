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

  it('signs a user in by email when federated_claims is absent', async () => {
    const ctx = makeContext();

    await resolve({ email: 'user@example.com' }, ctx);

    expect(ctx.signInWithCatalogUser).not.toHaveBeenCalled();
    expect(ctx.issueToken).toHaveBeenCalledWith({
      claims: { sub: 'user:default/user', ent: ['user:default/user'] },
    });
  });

  it('falls back to the guest user when the token carries no email', async () => {
    const ctx = makeContext();

    await resolve({}, ctx);

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
});
