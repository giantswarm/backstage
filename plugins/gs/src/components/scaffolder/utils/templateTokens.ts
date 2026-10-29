import validator from '@rjsf/validator-ajv8';
import {
  createSchemaUtils,
  isObject,
  type RJSFSchema,
  type SchemaUtilsType,
} from '@rjsf/utils';
import type { JsonObject } from '@backstage/types';
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';
import type {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import {
  getInstallationOidcToken,
  isSessionExpiredError,
  isSignInDeclinedError,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { TemplateSignInError } from '../../../apis/scaffolder/TemplateSignInError';
import { oidcTokenInstallation } from '../OIDCToken/schema';

export const OIDC_TOKEN_FIELD = 'GSOIDCToken';

/**
 * A `GSOIDCToken` field in the submitted form: the installation it recorded,
 * and the template secret its token goes into, when it names one.
 */
export type TemplateTokenField = { installation: string; secretsKey?: string };

/**
 * The `GSOIDCToken` fields of a submission, in step order, each with the
 * installation it recorded as its own value. Every schema is resolved against
 * the submitted values the way the form rendered it (conditionals, `$ref`s,
 * the selected `oneOf`/`anyOf` option, each array item), so a value left over
 * from a branch the person moved away from is not a field.
 */
export function templateTokenFields(
  manifest: TemplateParameterSchema,
  values: JsonObject,
): TemplateTokenField[] {
  const fields: TemplateTokenField[] = [];
  for (const step of manifest.steps) {
    const root = step.schema as RJSFSchema;
    collect(createSchemaUtils(validator, root), root, values, fields);
  }
  return fields;
}

function collect(
  schemaUtils: SchemaUtilsType,
  schema: RJSFSchema,
  data: unknown,
  fields: TemplateTokenField[],
) {
  const resolved = schemaUtils.retrieveSchema(schema, data);

  if (resolved['ui:field'] === OIDC_TOKEN_FIELD) {
    const installation = isObject(data)
      ? (data as Record<string, unknown>)[oidcTokenInstallation]
      : undefined;
    if (typeof installation === 'string' && installation) {
      const { secretsKey } = (resolved['ui:options'] ?? {}) as {
        secretsKey?: string;
      };
      fields.push({ installation, secretsKey: secretsKey || undefined });
    }
    return;
  }

  const options = (resolved.oneOf ?? resolved.anyOf)?.filter(
    (option): option is RJSFSchema => isObject(option),
  );
  if (options?.length) {
    const selected = schemaUtils.getClosestMatchingOption(
      data,
      options.map(option => schemaUtils.retrieveSchema(option, data)),
    );
    collect(schemaUtils, options[selected], data, fields);
  }

  if (Array.isArray(data)) {
    const { items, additionalItems } = resolved;
    data.forEach((item, index) => {
      const itemSchema = Array.isArray(items)
        ? (items[index] ?? additionalItems)
        : items;
      if (isObject(itemSchema)) {
        collect(schemaUtils, itemSchema as RJSFSchema, item, fields);
      }
    });
    return;
  }

  const values = isObject(data) ? (data as Record<string, unknown>) : {};
  for (const [name, property] of Object.entries(resolved.properties ?? {})) {
    if (isObject(property)) {
      collect(schemaUtils, property as RJSFSchema, values[name], fields);
    }
  }
}

/**
 * Mints the secrets of the given fields now, once per installation. Every
 * sign-in a mint asks for settles before this returns. When one did not
 * complete (an expired session, a declined prompt, a closed popup), this
 * rejects with a `TemplateSignInError`. Any other failure, such as an
 * installation the Kubernetes API does not know or an unreachable token
 * broker, leaves that installation's secrets out.
 */
export async function mintTemplateTokens(
  fields: TemplateTokenField[],
  kubernetesApi: KubernetesApi,
  kubernetesAuthProvidersApi: KubernetesAuthProvidersApi,
): Promise<Record<string, string>> {
  const secretsKeys = new Map<string, string[]>();
  for (const { installation, secretsKey } of fields) {
    if (secretsKey) {
      secretsKeys.set(installation, [
        ...(secretsKeys.get(installation) ?? []),
        secretsKey,
      ]);
    }
  }
  const installations = Array.from(secretsKeys.keys());
  const results = await Promise.allSettled(
    installations.map(installation =>
      getInstallationOidcToken(
        kubernetesApi,
        kubernetesAuthProvidersApi,
        installation,
      ),
    ),
  );

  const secrets: Record<string, string> = {};
  const expired: { installation: string; cause: unknown }[] = [];
  const declined: { installation: string; cause: unknown }[] = [];
  results.forEach((result, index) => {
    const installation = installations[index];
    if (result.status === 'fulfilled') {
      for (const key of secretsKeys.get(installation) ?? []) {
        secrets[key] = result.value;
      }
    } else if (isSessionExpiredError(result.reason)) {
      expired.push({ installation, cause: result.reason });
    } else if (isSignInDeclinedError(result.reason)) {
      declined.push({ installation, cause: result.reason });
    }
  });

  if (expired.length) {
    throw new TemplateSignInError(
      'session-expired',
      expired.map(failure => failure.installation),
      expired[0].cause,
    );
  }
  if (declined.length) {
    throw new TemplateSignInError(
      'declined',
      declined.map(failure => failure.installation),
      declined[0].cause,
    );
  }
  return secrets;
}
