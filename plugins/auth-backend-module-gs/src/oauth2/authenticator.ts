/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Strategy as Oauth2Strategy } from 'passport-oauth2';
import {
  createOAuthAuthenticator,
  PassportOAuthAuthenticatorHelper,
  PassportOAuthDoneCallback,
  PassportProfile,
  decodeOAuthState,
} from '@backstage/plugin-auth-node';
import * as crypto from 'crypto';

const PKCE_COOKIE_NAME = 'oauth2-pkce-verifier';

interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/** @private */
function generatePKCE(): PKCEParams {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/** @public */
export const oauth2Authenticator = createOAuthAuthenticator({
  defaultProfileTransform:
    PassportOAuthAuthenticatorHelper.defaultProfileTransform,
  initialize({ callbackUrl, config }) {
    const clientId = config.getString('clientId');
    const clientSecret = config.getString('clientSecret');
    const authorizationUrl = config.getString('authorizationUrl');
    const tokenUrl = config.getString('tokenUrl');
    const includeBasicAuth = config.getOptionalBoolean('includeBasicAuth');

    if (config.has('scope')) {
      throw new Error(
        'The oauth2 provider no longer supports the "scope" configuration option. Please use the "additionalScopes" option instead.',
      );
    }

    // Store config in helper context for later use
    const strategy = new Oauth2Strategy(
      {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: callbackUrl,
        authorizationURL: authorizationUrl,
        tokenURL: tokenUrl,
        passReqToCallback: false,
        pkce: false,
        state: false,
        customHeaders: includeBasicAuth
          ? {
              Authorization: `Basic ${encodeClientCredentials(
                clientId,
                clientSecret,
              )}`,
            }
          : undefined,
      },
      (
        accessToken: any,
        refreshToken: any,
        params: any,
        fullProfile: PassportProfile,
        done: PassportOAuthDoneCallback,
      ) => {
        // console.log(
        //   '=== OAuth2 access token acquired',
        //   fullProfile,
        //   params,
        //   accessToken,
        // );
        // console.log(
        //   '=== Token endpoint response params:',
        //   JSON.stringify(params, null, 2),
        // );
        // console.log('=== ID Token from params:', params.id_token);

        // Transform params to include idToken in the expected format
        const transformedParams = {
          ...params,
          idToken: params.id_token, // Map id_token to idToken for Backstage
        };

        done(
          undefined,
          { fullProfile, params: transformedParams, accessToken },
          { refreshToken },
        );
      },
    );

    const helperWithConfig = PassportOAuthAuthenticatorHelper.from(strategy);

    // Store strategy reference directly on helper for access in authenticate method
    (helperWithConfig as any)._strategyInstance = strategy;

    // Store reference for PKCE verifier
    (strategy as any)._pendingCodeVerifier = null;

    // Override the _oauth2.getOAuthAccessToken method to inject PKCE verifier
    const oauth2 = (strategy as any)._oauth2;
    const originalGetOAuthAccessToken = oauth2.getOAuthAccessToken.bind(oauth2);
    oauth2.getOAuthAccessToken = function getOAuthAccessTokenWithPKCE(
      code: string,
      params: any,
      callback: any,
    ) {
      // console.log('=== getOAuthAccessToken called with params:', params);

      // Inject code_verifier if available from the strategy instance
      if ((strategy as any)._pendingCodeVerifier) {
        params.code_verifier = (strategy as any)._pendingCodeVerifier;
        // console.log(
        //   '=== Injected code_verifier into token exchange params:',
        //   params.code_verifier,
        // );
        (strategy as any)._pendingCodeVerifier = null; // Clear after use
      }

      return originalGetOAuthAccessToken(code, params, callback);
    };

    // Attach config to helper for use in start method
    (helperWithConfig as any)._oauth2Config = {
      clientId,
      authorizationUrl,
      callbackUrl,
    };

    return helperWithConfig;
  },

  async start(input, helper) {
    // console.log('=== OAuth2 start called');
    // console.log('=== Input scope:', input.scope);

    // Generate PKCE parameters
    const pkce = generatePKCE();

    // Decode state to get nonce
    const state = decodeOAuthState(input.state);
    // console.log('=== OAuth2 start state', state);

    // Store PKCE verifier in cookie tied to nonce
    // Sanitize nonce to ensure it's a valid cookie name (alphanumeric, no special chars except dash/underscore)
    const sanitizedNonce = Buffer.from(state.nonce).toString('base64url');
    const cookieName = `${PKCE_COOKIE_NAME}-${sanitizedNonce}`;
    const res = (input.req as any).res;
    if (res && res.cookie) {
      res.cookie(cookieName, pkce.codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: '/',
      });
    }

    // Manually construct authorization URL with PKCE parameters
    const config = (helper as any)._oauth2Config;
    const authUrl = new URL(config.authorizationUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', input.state);
    authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    // Add scopes - ensure they're included
    if (input.scope) {
      authUrl.searchParams.set('scope', input.scope);
      // console.log('=== Added scopes to auth URL:', input.scope);
    } else {
      console.warn('=== WARNING: No scopes provided in input');
    }

    const finalUrl = authUrl.toString();
    // console.log('=== Final authorization URL:', finalUrl);

    return { url: finalUrl };
  },

  async authenticate(input, helper) {
    // console.log('=== OAuth2 authenticate called');

    // const state2 = decodeOAuthState(input.req.query.state?.toString() ?? '');
    // console.log('=== OAuth2 authenticate state', state2);

    // Extract state from query parameters
    const url = new URL(input.req.url || '', 'http://localhost');
    const stateParam = url.searchParams.get('state');

    if (!stateParam) {
      throw new Error('Missing state parameter');
    }

    // Decode state to get nonce
    const state = decodeOAuthState(stateParam);
    // console.log('=== Decoded state in authenticate', state);
    // Sanitize nonce to match the cookie name format used in start()
    const sanitizedNonce = Buffer.from(state.nonce).toString('base64url');
    const cookieName = `${PKCE_COOKIE_NAME}-${sanitizedNonce}`;

    // Retrieve PKCE verifier from cookie
    const cookies = (input.req as any).cookies || {};
    const codeVerifier = cookies[cookieName];

    if (!codeVerifier) {
      throw new Error(
        'Missing PKCE code verifier - OAuth flow may have expired',
      );
    }

    // console.log(
    //   '=== Retrieved PKCE verifier from cookie:',
    //   `${codeVerifier.substring(0, 10)}...`,
    // );

    // Clear the PKCE cookie
    const res = (input.req as any).res;
    if (res && res.clearCookie) {
      res.clearCookie(cookieName, { path: '/' });
    }

    // Store code verifier in the strategy for use during token exchange
    // Access the strategy we stored during initialization
    const strategyInstance = (helper as any)._strategyInstance;

    if (strategyInstance) {
      strategyInstance._pendingCodeVerifier = codeVerifier;
      // console.log('=== Stored code_verifier in strategy for token exchange');
      // console.log('=== Verifier value:', `${codeVerifier.substring(0, 10)}...`);
    } else {
      console.error(
        '=== ERROR: Could not access strategy instance from helper!',
      );
      throw new Error(
        'Strategy instance not found - authentication cannot proceed',
      );
    }

    let authResult;
    try {
      authResult = await helper.authenticate(input);
      // console.log('=== OAuth2 authenticate result', authResult);
    } catch (e) {
      console.error('=== OAuth2 authenticate error', e);
      throw e;
    }
    return authResult;
  },

  async refresh(input, helper) {
    // console.log('=== OAuth2 refresh called');
    return helper.refresh(input);
  },
});

/** @private */
function encodeClientCredentials(
  clientID: string,
  clientSecret: string,
): string {
  return Buffer.from(`${clientID}:${clientSecret}`).toString('base64');
}
