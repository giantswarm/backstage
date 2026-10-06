import { get } from 'lodash';
import validator from '@rjsf/validator-ajv8';
import { retrieveSchema, type RJSFSchema } from '@rjsf/utils';
import type { JsonValue } from '@backstage/types';
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { getInstallationOidcToken } from '@giantswarm/backstage-plugin-kubernetes-react';

export const OIDC_TOKEN_FIELD = 'GSOIDCToken';

/** A cluster token a submission carries, as a template secret. */
export type TemplateToken = { secretsKey: string; installation: string };

type OIDCTokenOptions = {
  secretsKey?: string;
  installationName?: string;
  installationNameField?: string;
};

/**
 * The cluster tokens a submission needs: one per `GSOIDCToken` field in the
 * form as it stands. Each step's conditional parts are resolved against the
 * entries, so a field in a branch the person moved away from needs no token.
 * A field without a secrets key or an installation needs none either.
 */
export function templateTokens(
  manifest: TemplateParameterSchema,
  formState: Record<string, JsonValue>,
): TemplateToken[] {
  const tokens = new Map<string, string>();
  for (const step of manifest.steps) {
    const root = step.schema as RJSFSchema;
    collect(root, root, formState, formState, tokens);
  }
  return Array.from(tokens, ([secretsKey, installation]) => ({
    secretsKey,
    installation,
  }));
}

function collect(
  schema: RJSFSchema,
  root: RJSFSchema,
  data: unknown,
  formState: Record<string, JsonValue>,
  tokens: Map<string, string>,
) {
  const resolved = retrieveSchema(validator, schema, root, data);
  if (resolved['ui:field'] === OIDC_TOKEN_FIELD) {
    const options = (resolved['ui:options'] ?? {}) as OIDCTokenOptions;
    const installation =
      options.installationName ||
      (options.installationNameField
        ? get(formState, options.installationNameField)
        : undefined);
    if (
      options.secretsKey &&
      typeof installation === 'string' &&
      installation
    ) {
      tokens.set(options.secretsKey, installation);
    }
    return;
  }
  const values =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  for (const [name, property] of Object.entries(resolved.properties ?? {})) {
    if (typeof property === 'object') {
      collect(property, root, values[name], formState, tokens);
    }
  }
}

/**
 * Mints every token now. An installation the portal cannot mint for without a
 * sign-in (unknown to the Kubernetes API, or no token from its provider) is
 * left out, and the template runs without that secret. Any other failure, such
 * as a declined or failed sign-in, rejects.
 */
export async function mintTemplateTokens(
  tokens: TemplateToken[],
  kubernetesApi: KubernetesApi,
  kubernetesAuthProvidersApi: KubernetesAuthProvidersApi,
): Promise<Record<string, string>> {
  const minted = await Promise.all(
    tokens.map(async ({ secretsKey, installation }) => {
      try {
        const token = await getInstallationOidcToken(
          kubernetesApi,
          kubernetesAuthProvidersApi,
          installation,
        );
        return [[secretsKey, token] as const];
      } catch (error) {
        if ((error as Error)?.name === 'InstallationTokenUnavailableError') {
          return [];
        }
        throw error;
      }
    }),
  );
  return Object.fromEntries(minted.flat());
}
