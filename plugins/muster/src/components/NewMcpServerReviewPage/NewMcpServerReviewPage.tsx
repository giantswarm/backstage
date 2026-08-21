import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef } from '../../apis';
import {
  newMcpServerRouteRef,
  newMcpServerAuthRouteRef,
  newMcpServerVerifyRouteRef,
} from '../../routes';
import {
  toMcpServerManifestYaml,
  toMusterCliCommand,
  type McpServerAuthMode,
} from '../../lib/mcpServerDefinition';
import { mutationErrorMessage } from '../../lib/authError';
import { useMusterSession } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { Gate } from '../shared';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    padding: theme.spacing(2, 0),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(4),
  },
  code: {
    fontFamily: 'monospace',
  },
  codeBlock: {
    whiteSpace: 'pre',
    overflowX: 'auto',
    fontFamily: 'monospace',
    fontSize: 12,
    margin: 0,
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
  },
  details: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  summaryLine: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  detailsBody: {
    marginTop: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

const AUTH_MODE_LABELS: Record<McpServerAuthMode, string> = {
  none: 'No authentication',
  'own-account': 'Sign in with your own account (OAuth)',
  'platform-sso': 'Platform SSO (token forwarding)',
};

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-x-small" color="secondary">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

/**
 * Step 3 (Review & register) of the MCP server registration wizard: summary
 * strip, the full generated server definition, a collapsed manual fallback
 * (manifest + CLI command), then registration through muster's existing
 * validate + create core tools over the per-user MCP session — the same live
 * write path the raw-JSON dialog and the CLI use. Validate runs as a dry-run
 * before anything is written. When this wizard run already registered the CR
 * (the verify step's "Edit details" loop), saving is an update to that same CR
 * — never a delete-and-recreate.
 */
export function NewMcpServerReviewPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  const detailsLink = useRouteRef(newMcpServerRouteRef);
  const authLink = useRouteRef(newMcpServerAuthRouteRef);
  const verifyLink = useRouteRef(newMcpServerVerifyRouteRef);
  const { state, definition, isComplete, registeredName, setRegisteredName } =
    useNewMcpServerForm();
  const {
    authenticated,
    connecting,
    connect: handleConnect,
  } = useMusterSession();

  const isEdit = Boolean(registeredName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onRegister = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Dry-run first: muster's own validation, so the definition is checked by
      // the same authority that will apply it.
      await musterApi.callTool(
        'core_mcpserver_validate',
        definition,
        state.installation,
      );
      await musterApi.callTool(
        isEdit ? 'core_mcpserver_update' : 'core_mcpserver_create',
        definition,
        state.installation,
      );
      setRegisteredName(definition.name);
      // The CR exists now — refresh every muster read (server lists, tools) so
      // the verify step opens on live data.
      queryClient.invalidateQueries({ queryKey: ['muster'] });
      if (verifyLink) {
        navigate(verifyLink());
      }
    } catch (e) {
      setError(mutationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [
    musterApi,
    definition,
    state.installation,
    isEdit,
    setRegisteredName,
    queryClient,
    verifyLink,
    navigate,
  ]);

  const registerLabel = isEdit ? 'Save changes' : 'Register server';
  const busyLabel = isEdit ? 'Saving…' : 'Registering…';

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          isDisabled={busy}
          onPress={() => authLink && navigate(authLink())}
        >
          Back
        </Button>
        <Button
          variant="primary"
          isDisabled={busy || !authenticated}
          onPress={onRegister}
        >
          {busy ? busyLabel : registerLabel}
        </Button>
      </Flex>
    ),
    [
      busy,
      authenticated,
      authLink,
      navigate,
      onRegister,
      busyLabel,
      registerLabel,
    ],
  );

  // Guarded like the earlier steps: when this render only redirects, pushing
  // actions into the shared header would flash controls for an unseen page.
  const isRedirecting = !isComplete;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A deep link with the form incomplete can't be reviewed — back to step 1.
  if (isRedirecting) {
    return <Navigate to={detailsLink ? detailsLink() : '..'} replace />;
  }

  const definitionJson = JSON.stringify(definition, null, 2);
  const manifestYaml = toMcpServerManifestYaml(definition);
  const cliCommand = toMusterCliCommand(definition);

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step 3 of 4: Review &amp; register
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Review and register
        </Text>
        <Text as="p" color="secondary" className={classes.intro}>
          {isEdit ? (
            <>
              Your changes are saved as an update to the already-registered
              server <span className={classes.code}>{registeredName}</span> on{' '}
              <strong>{state.installation}</strong> — the same server, updated
              in place.
            </>
          ) : (
            <>
              Your answers are composed into one muster server definition.
              Registering validates it first (a dry run), then creates the
              server on <strong>{state.installation}</strong> — the next step
              watches it connect.
            </>
          )}
        </Text>

        <div className={classes.summary}>
          <SummaryItem label="Server">
            <span className={classes.code}>{definition.name}</span>
          </SummaryItem>
          <SummaryItem label="Installation">
            <span className={classes.code}>{state.installation}</span>
          </SummaryItem>
          <SummaryItem label="Endpoint">
            <span className={classes.code}>{definition.url}</span>
          </SummaryItem>
          <SummaryItem label="Transport">
            <span className={classes.code}>{definition.type}</span>
          </SummaryItem>
          <SummaryItem label="Authentication">
            <Text variant="body-small">{AUTH_MODE_LABELS[state.authMode]}</Text>
          </SummaryItem>
        </div>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="h3" variant="title-small" weight="bold">
                  Server definition
                </Text>
                <Text as="p" variant="body-small" color="secondary">
                  Exactly what is passed to muster&apos;s validate and{' '}
                  {isEdit ? 'update' : 'create'} tools.
                </Text>
                <pre className={classes.codeBlock}>{definitionJson}</pre>

                <details className={classes.details}>
                  <summary className={classes.summaryLine}>
                    Register manually instead
                  </summary>
                  <div className={classes.detailsBody}>
                    <Text variant="body-small" color="secondary">
                      Prefer GitOps or the CLI? Commit the manifest to your
                      management-clusters repo, or run the command against the
                      installation.
                    </Text>
                    <pre className={classes.codeBlock}>{manifestYaml}</pre>
                    <pre className={classes.codeBlock}>{cliCommand}</pre>
                  </div>
                </details>
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                {!authenticated && (
                  <Gate
                    label="Registering runs live through muster, which needs an authenticated session."
                    action={
                      <Button
                        variant="primary"
                        size="small"
                        isDisabled={connecting}
                        onPress={handleConnect}
                      >
                        {connecting ? 'Connecting…' : 'Connect to muster'}
                      </Button>
                    }
                  />
                )}
                {error && (
                  <Alert
                    status="danger"
                    title={isEdit ? 'Save failed' : 'Registration failed'}
                    description={error}
                  />
                )}
                <Flex justify="between" align="center" gap="4">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">
                      {isEdit
                        ? `Save changes to ${registeredName}`
                        : `Register on ${state.installation}`}
                    </Text>
                    <Text variant="body-small" color="secondary">
                      Validates the definition first, then{' '}
                      {isEdit
                        ? 'updates the existing server in place.'
                        : 'creates the server and moves on to watch it connect.'}
                    </Text>
                  </Flex>
                  <Button
                    variant="primary"
                    isDisabled={busy || !authenticated}
                    onPress={onRegister}
                  >
                    {busy ? busyLabel : registerLabel}
                  </Button>
                </Flex>
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
