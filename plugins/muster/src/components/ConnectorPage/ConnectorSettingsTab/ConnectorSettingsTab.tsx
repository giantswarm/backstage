import { ReactNode, useMemo, useState } from 'react';
import { Alert, Button, Flex, Select, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { MCPServer } from '../../../lib/k8s';
import { isGitOpsManaged, toMcpServerDefinition } from '../../../lib/gitops';
import { mutationErrorMessage } from '../../../lib/authError';
import {
  composeMcpServerDefinition,
  emptyAuthAnswer,
  formStateFromServer,
  McpServerAuthMode,
  mergeOntoExisting,
  NewMcpServerFormState,
  validateMcpServerAuth,
  validateMcpServerDetails,
  wizardEditBlocker,
} from '../../../lib/mcpServerDefinition';
import { ServerPageRow } from '../../../lib/serverGrouping';
import { useRegisterMcpServer } from '../../NewMcpServerReviewPage/useRegisterMcpServer';
import { GitOpsEditDialog } from '../../ServerPage/GitOpsEditDialog';
import { AdHocServerDialog } from '../../ServerPage/serverActions';
import { ServerInstancesTab } from '../../ServerPage/ServerInstancesTab';
import { SIGN_IN_CHOICES, signInLabel } from '../connectorFacts';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: 560,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 8,
  },
  instances: {
    marginTop: 40,
  },
});

/** The sign-in choices offered for a server whose current answer is `current`. */
function signInOptions(current: McpServerAuthMode) {
  const offered: McpServerAuthMode[] = ['platform-sso', 'own-account', 'none'];
  // Signing requests needs a region the form does not ask for, so it is kept,
  // never chosen here.
  if (current === 'sigv4') {
    offered.push('sigv4');
  }
  return offered.map(id => ({ id, label: SIGN_IN_CHOICES[id] }));
}

/**
 * The server's wizard state with this form's two edits laid over it. A
 * changed sign-in starts from no answer, as the wizard's does.
 */
export function editedState(
  server: MCPServer,
  url: string,
  authMode: McpServerAuthMode,
): NewMcpServerFormState {
  const initial = formStateFromServer(server);
  return {
    ...initial,
    ...(authMode === initial.authMode ? {} : emptyAuthAnswer),
    url,
    authMode,
  };
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Text as="p" variant="body-small" color="secondary">
      {children}
    </Text>
  );
}

function EditForm({ server }: { server: MCPServer }) {
  const classes = useStyles();
  const initial = useMemo(() => formStateFromServer(server), [server]);
  const [url, setUrl] = useState(initial.url);
  const [authMode, setAuthMode] = useState(initial.authMode);
  const [problems, setProblems] = useState<string[]>([]);
  const registration = useRegisterMcpServer();

  const dirty = url !== initial.url || authMode !== initial.authMode;

  const save = () => {
    const state = editedState(server, url, authMode);
    const errors = [
      ...validateMcpServerDetails(state),
      ...validateMcpServerAuth(state),
    ];
    setProblems(errors);
    if (errors.length > 0) {
      return;
    }
    registration.mutate({
      definition: mergeOntoExisting(
        toMcpServerDefinition(server),
        composeMcpServerDefinition(state),
      ),
      installation: server.cluster,
      authMode,
      isEdit: true,
    });
  };

  const cancel = () => {
    setUrl(initial.url);
    setAuthMode(initial.authMode);
    setProblems([]);
    registration.reset();
  };

  return (
    <form
      className={classes.form}
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
    >
      <TextField label="Name" value={server.getName()} isReadOnly />
      <TextField
        label="Server address"
        type="url"
        value={url}
        onChange={setUrl}
        isRequired
      />
      <Select
        label="Sign-in"
        options={signInOptions(initial.authMode)}
        selectedKey={authMode}
        onSelectionChange={key => {
          if (key) {
            setAuthMode(key as McpServerAuthMode);
          }
        }}
      />
      {problems.length > 0 && (
        <Alert
          status="danger"
          title="Check these settings"
          description={problems.join('. ')}
        />
      )}
      {registration.error && (
        <Alert
          status="danger"
          title="Could not save"
          description={mutationErrorMessage(registration.error)}
        />
      )}
      {registration.isSuccess && !dirty && (
        <Alert
          status="success"
          description="Saved. The connection status may take a few seconds to settle."
        />
      )}
      <div className={classes.footer}>
        <Button
          variant="secondary"
          onPress={cancel}
          isDisabled={!dirty || registration.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={!dirty}
          isPending={registration.isPending}
        >
          Save and reconnect
        </Button>
      </div>
    </form>
  );
}

function ReadOnlySettings({
  server,
  children,
}: {
  server: MCPServer;
  children?: ReactNode;
}) {
  const classes = useStyles();
  const url = server.getUrl();
  return (
    <div className={classes.form}>
      <TextField label="Name" value={server.getName()} isReadOnly />
      {url && <TextField label="Server address" value={url} isReadOnly />}
      <TextField label="Sign-in" value={signInLabel(server)} isReadOnly />
      {children}
    </div>
  );
}

function GitOpsSettings({ server }: { server: MCPServer }) {
  const [open, setOpen] = useState(false);
  return (
    <ReadOnlySettings server={server}>
      <Note>
        This connector is managed in Git: a change made here would be reverted,
        so it is changed in its source.
      </Note>
      <Flex justify="end">
        <Button variant="secondary" onPress={() => setOpen(true)}>
          Edit in Git
        </Button>
      </Flex>
      <GitOpsEditDialog server={server} isOpen={open} onOpenChange={setOpen} />
    </ReadOnlySettings>
  );
}

function JsonOnlySettings({
  server,
  blocker,
}: {
  server: MCPServer;
  blocker: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ReadOnlySettings server={server}>
      <Note>{blocker}</Note>
      <Flex justify="end">
        <Button variant="secondary" onPress={() => setOpen(true)}>
          Edit as JSON
        </Button>
      </Flex>
      <AdHocServerDialog
        server={server}
        open={open}
        onClose={() => setOpen(false)}
      />
    </ReadOnlySettings>
  );
}

export interface ConnectorSettingsTabProps {
  row: ServerPageRow;
  /** The server whose settings a family shows, its representative instance. */
  representative?: MCPServer;
  /** Every management cluster the installation's families reach. */
  fleetClusters: string[];
  authenticated: boolean;
}

/**
 * The connector's name, address and sign-in. Editable for a server added
 * through the portal while the muster session is connected; read-only, with
 * where it is changed instead, for one managed in Git, one the form cannot
 * represent, and a family, whose instances follow below.
 */
export function ConnectorSettingsTab({
  row,
  representative,
  fleetClusters,
  authenticated,
}: ConnectorSettingsTabProps) {
  const classes = useStyles();

  if (row.kind === 'family') {
    return (
      <>
        {representative && (
          <ReadOnlySettings server={representative}>
            <Note>
              {isGitOpsManaged(representative)
                ? 'This connector is managed in Git, where each instance is configured.'
                : 'A connector with several instances is not edited from this page.'}
            </Note>
          </ReadOnlySettings>
        )}
        <section className={classes.instances} aria-labelledby="instances">
          <Flex direction="column" gap="3">
            <Text as="h2" id="instances" variant="title-x-small" weight="bold">
              Instances
            </Text>
            <ServerInstancesTab
              instances={row.servers}
              fleetClusters={fleetClusters}
              authenticated={authenticated}
            />
          </Flex>
        </section>
      </>
    );
  }
  if (row.kind !== 'server') {
    return null;
  }

  const server = row.server;
  if (isGitOpsManaged(server)) {
    return <GitOpsSettings server={server} />;
  }
  if (!authenticated) {
    return (
      <ReadOnlySettings server={server}>
        <Note>
          Changing this connector runs through your muster session, which is not
          connected.
        </Note>
      </ReadOnlySettings>
    );
  }
  const blocker = wizardEditBlocker(server);
  if (blocker) {
    return <JsonOnlySettings server={server} blocker={blocker} />;
  }
  return <EditForm server={server} />;
}
