import { Config } from '@backstage/config';
import {
  OAuthAuthenticatorResult,
  PassportDoneCallback,
} from '@backstage/plugin-auth-node';
import {
  createOAuthAuthenticator,
  decodeOAuthState,
  encodeOAuthState,
} from '@backstage/plugin-auth-node';
import {
  Client,
  Issuer,
  TokenSet,
  Strategy as OidcStrategy,
  BaseClient,
} from 'openid-client';
import { DateTime } from 'luxon';
import { OidcAuthResult } from '@backstage/plugin-auth-backend-module-oidc-provider';

const rfc8693TokenExchange = async ({
  subject_token,
  target_audience,
  ctx,
}: {
  subject_token: string;
  target_audience: string;
  ctx: Promise<{
    providerStrategy: OidcStrategy<{}>;
    client: Client;
  }>;
}): Promise<string | undefined> => {
  const { client } = await ctx;
  return client
    .grant({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token,
      audience: target_audience,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    })
    .then(tokenset => tokenset.access_token)
    .catch(err => {
      throw new Error(`RFC8693 token exchange failed with error: ${err}`);
    });
};

const OIDC_METADATA_TTL_SECONDS = 3600;

export class PinnipedStrategyCache {
  private readonly callbackUrl: string;
  private readonly config: Config;
  private strategyPromise: Promise<{
    providerStrategy: OidcStrategy<{ tokenset: TokenSet }, BaseClient>;
    client: BaseClient;
  }>;

  private cachedPromise?: Promise<{
    providerStrategy: OidcStrategy<{ tokenset: TokenSet }, BaseClient>;
    client: BaseClient;
  }>;
  private cachedPromiseExpiry?: Date;

  constructor(callbackUrl: string, config: Config) {
    this.callbackUrl = callbackUrl;
    this.config = config;
    this.strategyPromise = this.buildStrategy();
  }

  public async getStrategy(): Promise<{
    providerStrategy: OidcStrategy<{ tokenset: TokenSet }, BaseClient>;
    client: BaseClient;
  }> {
    if (this.cachedPromise) {
      if (
        this.cachedPromiseExpiry &&
        DateTime.fromJSDate(this.cachedPromiseExpiry) > DateTime.local()
      ) {
        return this.cachedPromise;
      }
      // cachedPromise has expired, remove promise from cache and regenerate strategy
      this.strategyPromise = this.buildStrategy();
      delete this.cachedPromise;
    }

    try {
      // if strategy is generated successfully, save it to cache
      await this.strategyPromise;
      this.cachedPromise = this.strategyPromise;
      this.cachedPromiseExpiry = DateTime.utc()
        .plus({ seconds: OIDC_METADATA_TTL_SECONDS })
        .toJSDate();
    } catch (error) {
      // if we fail to generate a strategy, retry and overwrite strategy
      this.strategyPromise = this.buildStrategy();
      delete this.cachedPromise;
      delete this.cachedPromiseExpiry;
    }

    return this.strategyPromise;
  }

  private async buildStrategy(): Promise<{
    providerStrategy: OidcStrategy<{ tokenset: TokenSet }, BaseClient>;
    client: BaseClient;
  }> {
    const issuer = await Issuer.discover(
      `${this.config.getString(
        'federationDomain',
      )}/.well-known/openid-configuration`,
    );
    const client = new issuer.Client({
      access_type: 'offline',
      client_id: this.config.getString('clientId'),
      client_secret: this.config.getString('clientSecret'),
      redirect_uris: [this.callbackUrl],
      response_types: ['code'],
      id_token_signed_response_alg: 'ES256',
    });
    const providerStrategy = new OidcStrategy(
      {
        client,
        passReqToCallback: false,
      },
      (
        tokenset: TokenSet,
        done: PassportDoneCallback<
          { tokenset: TokenSet },
          {
            refreshToken?: string;
          }
        >,
      ) => {
        done(undefined, { tokenset }, {});
      },
    );
    return { providerStrategy, client };
  }
}

export const pinnipedAuthenticator = createOAuthAuthenticator<
  PinnipedStrategyCache,
  OidcAuthResult
>({
  defaultProfileTransform: async (_r, _c) => ({ profile: {} }),
  scopes: {
    required: [
      'openid',
      'pinniped:request-audience',
      'username',
      'offline_access',
    ],
  },
  initialize({ callbackUrl, config }) {
    if (config.has('scope')) {
      throw new Error(
        'The pinniped provider no longer supports the "scope" configuration option. Please use the "additionalScopes" option instead.',
      );
    }
    return new PinnipedStrategyCache(callbackUrl, config);
  },
  async start(input, ctx): Promise<{ url: string; status?: number }> {
    const { providerStrategy } = await ctx.getStrategy();
    const stringifiedAudience = input.req.query?.audience as string;
    const decodedState = decodeOAuthState(input.state);
    const state = { ...decodedState, audience: stringifiedAudience };
    const options: Record<string, string> = {
      scope: input.scope,
      state: encodeOAuthState(state),
    };

    return new Promise((resolve, reject) => {
      const strategy = Object.create(providerStrategy);
      strategy.redirect = (url: string) => {
        resolve({ url });
      };
      strategy.error = (error: Error) => {
        reject(error);
      };
      strategy.authenticate(input.req, { ...options });
    });
  },

  async authenticate(
    input,
    ctx,
  ): Promise<OAuthAuthenticatorResult<OidcAuthResult>> {
    const { providerStrategy } = await ctx.getStrategy();
    const { req } = input;
    const { searchParams } = new URL(req.url, 'https://pinniped.com');
    const stateParam = searchParams.get('state');
    const audience = stateParam
      ? decodeOAuthState(stateParam).audience
      : undefined;

    return new Promise((resolve, reject) => {
      const strategy = Object.create(providerStrategy);
      strategy.success = (user: any) => {
        (audience
          ? rfc8693TokenExchange({
              subject_token: user.tokenset.access_token,
              target_audience: audience,
              ctx: ctx.getStrategy(),
            }).catch(err =>
              reject(
                new Error(
                  `Failed to get cluster specific ID token for "${audience}": ${err}`,
                ),
              ),
            )
          : Promise.resolve(user.tokenset.id_token)
        ).then(idToken => {
          const expiresInSeconds = user.tokenset.expires_at
            ? user.tokenset.expires_at - Math.floor(Date.now() / 1000) + 120
            : undefined;

          resolve({
            fullProfile: {
              tokenset: user.tokenset,
              userinfo: user.userinfo,
            },
            session: {
              accessToken: user.tokenset.access_token!,
              tokenType: user.tokenset.token_type ?? 'bearer',
              scope: user.tokenset.scope!,
              idToken,
              refreshToken: user.tokenset.refresh_token,
              expiresInSeconds,
            },
          });
        });
      };

      strategy.fail = (info: any) => {
        reject(new Error(`Authentication rejected, ${info.message || ''}`));
      };

      strategy.error = (error: Error) => {
        reject(error);
      };

      strategy.redirect = () => {
        reject(new Error('Unexpected redirect'));
      };

      strategy.authenticate(req);
    });
  },

  async refresh(input, ctx) {
    const { client } = await ctx.getStrategy();
    const tokenset = await client.refresh(input.refreshToken);

    let idToken = tokenset.id_token;

    const audience = input.req.query.audience?.toString();
    if (audience) {
      idToken = await rfc8693TokenExchange({
        subject_token: tokenset.access_token!,
        target_audience: audience,
        ctx: ctx.getStrategy(),
      });
    }

    return new Promise((resolve, reject) => {
      if (!tokenset.access_token) {
        reject(new Error('Refresh Failed'));
      }

      const expiresInSeconds = tokenset.expires_at
        ? tokenset.expires_at - Math.floor(Date.now() / 1000) + 120
        : undefined;

      resolve({
        fullProfile: {
          tokenset,
          userinfo: { sub: tokenset.claims()?.sub || 'unknown' },
        },
        session: {
          accessToken: tokenset.access_token!,
          tokenType: tokenset.token_type ?? 'bearer',
          scope: tokenset.scope!,
          idToken,
          refreshToken: tokenset.refresh_token,
          expiresInSeconds,
        },
      });
    });
  },
});
