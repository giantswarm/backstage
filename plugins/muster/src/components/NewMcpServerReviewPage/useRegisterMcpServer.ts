import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { musterApiRef } from '../../apis';
import { isMusterAuthError } from '../../lib/authError';
import { MCP_SERVER_UPDATED } from '../../lib/connectorToolEvents';
import {
  takesClientCredentials,
  takesDisplayName,
  withoutClientSecretRef,
  type ClientCredentials,
  type McpServerAuthMode,
  type McpServerDefinition,
} from '../../lib/mcpServerDefinition';
import { writeToolSchemaQuery } from './useTakesDisplayName';

/**
 * Client credentials handed to exactly one write. React Query keeps a
 * mutation's variables after it settles (and shows them in its devtools), so
 * the values do not travel as plain variables: the write takes them out of
 * this holder, which is empty from then on. A private field, so neither
 * `JSON.stringify` nor an error serializer finds them on the variables.
 */
export class OneTimeClientCredentials {
  #value: ClientCredentials | undefined;

  constructor(value: ClientCredentials) {
    this.#value = value;
  }

  /** The credentials, once; `undefined` on every later call. */
  take(): ClientCredentials | undefined {
    const value = this.#value;
    this.#value = undefined;
    return value;
  }
}

export type McpServerRegistration = {
  definition: McpServerDefinition;
  installation: string | undefined;
  authMode: McpServerAuthMode;
  /** The wizard run already registered the server: update it in place. */
  isEdit: boolean;
  /**
   * The run started from the server's Edit, so an update is an edit of a
   * registered server rather than a correction inside its registration.
   */
  startedFromEdit: boolean;
  /**
   * A client's ID and secret for muster to store in a Secret bound to the
   * server (`clientCredentials` of create and update). Sent to the write
   * only — never to validate — and then with the definition's own
   * `clientCredentialsSecretRef` left out, since muster sets that itself.
   */
  clientCredentials?: OneTimeClientCredentials;
};

/**
 * The wizard's write, through muster's own core tools over the per-user MCP
 * session — the same live write path the raw-JSON dialog and the CLI use.
 * Validate runs as a dry-run first, so the definition is checked by the
 * authority that will apply it; then create, or update when this wizard run
 * registered the server already (never a delete-and-recreate). A create is
 * reported as `Muster.mcpServerAdded`, an update in a run started from the
 * server's Edit as `Muster.mcpServerUpdated`; an update later in an Add run is
 * part of the registration, and reports nothing.
 *
 * The definition's `displayName` goes only to a tool whose input schema
 * declares it (muster v5.43.0 and later); an older muster refuses unknown
 * fields, so it gets the definition without it — the connector is then named
 * by its resource name, as before. Each tool's schema is checked on its own.
 * When a schema cannot be read, nothing is written: dropping the name then
 * would lose it without a word. Resolves to the definition the write tool was
 * sent.
 */
export function useRegisterMcpServer() {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();

  return useTrackedMutation({
    mutationFn: async ({
      definition: composed,
      installation,
      isEdit,
      clientCredentials: handedOver,
    }: McpServerRegistration): Promise<McpServerDefinition> => {
      const tool = isEdit ? 'core_mcpserver_update' : 'core_mcpserver_create';
      // Taken at once, so the values live only in this call's scope.
      const clientCredentials = handedOver?.take();
      const definition = clientCredentials
        ? withoutClientSecretRef(composed)
        : composed;
      const { displayName, ...withoutDisplayName } = definition;
      const schemaOf = (name: string, asking: string) =>
        queryClient
          .fetchQuery(writeToolSchemaQuery(musterApi, name, installation))
          .then(detail => detail.inputSchema)
          .catch(error => {
            if (isMusterAuthError(error)) {
              throw error;
            }
            throw new Error(
              `Muster could not be asked whether it ${asking} (${
                (error as Error)?.message ?? error
              }). Nothing was saved; try again.`,
            );
          });
      const definitionFor = async (
        name: string,
      ): Promise<McpServerDefinition> => {
        if (displayName === undefined) {
          return definition;
        }
        return takesDisplayName(
          await schemaOf(name, "keeps the connector's name"),
        )
          ? definition
          : withoutDisplayName;
      };
      // An older muster refuses the argument as unknown, after the person
      // typed a client: say what it cannot do instead (the sign-in step
      // hides the fields once it knows).
      const takesClient = async () => {
        if (
          clientCredentials &&
          !takesClientCredentials(await schemaOf(tool, 'can store a client'))
        ) {
          throw new Error(
            'Muster on this installation cannot store a client yet. Nothing was saved; choose Existing Secret to name a Secret that holds the client instead.',
          );
        }
      };
      const [validated, sent] = await Promise.all([
        definitionFor('core_mcpserver_validate'),
        definitionFor(tool),
        takesClient(),
      ]);
      await musterApi.callTool(
        'core_mcpserver_validate',
        validated,
        installation,
      );
      await musterApi.callTool(
        tool,
        clientCredentials ? { ...sent, clientCredentials } : sent,
        installation,
      );
      // What was written, without the credentials: the caller keeps it as the
      // base of later saves.
      return sent;
    },
    event: (_data, { isEdit, startedFromEdit, authMode }) => {
      if (!isEdit) {
        return { name: 'Muster.mcpServerAdded', attributes: { authMode } };
      }
      return startedFromEdit ? MCP_SERVER_UPDATED : null;
    },
    // The CR exists now — refresh every muster read (server lists, tools) so
    // the verify step opens on live data.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['muster'] }),
  });
}
