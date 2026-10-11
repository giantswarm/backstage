import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import {
  fieldErrorProps,
  useFieldValidation,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { newMcpServerAuthRouteRef } from '../../routes';
import { useMusterInstance } from '../MusterInstanceProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { withEditParam } from '../NewMcpServerEditGate';
import { TextAreaField } from '../NewMcpServerPage/TextAreaField';
import { useTransportDetection } from '../NewMcpServerPage/useTransportDetection';
import { ConnectorWizardFrame } from './ConnectorWizardFrame';

const useStyles = makeStyles({
  found: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: 24,
    padding: '0 8px',
    borderRadius: 6,
    background: 'var(--bui-success-bg-subdued, #e7f6ec)',
    color: 'var(--bui-success-fg-subdued, #14612a)',
    fontSize: 12,
    '& svg': { width: 12, height: 12 },
  },
});

const TRANSPORT_NAMES = {
  'streamable-http': 'Streamable HTTP',
  sse: 'SSE',
} as const;

/**
 * What the probe of `url` says, as one inline line under the address field —
 * the prototype's "Server found" state. Nothing while there is nothing to
 * say: an incomplete URL, a verdict about an address already typed past.
 */
function DetectionStatus({
  url,
  installation,
}: {
  url: string;
  installation: string | undefined;
}) {
  const classes = useStyles();
  const { probing, detection, probedUrl } = useTransportDetection(
    url,
    installation,
  );

  if (probing) {
    return (
      <Text variant="body-small" color="secondary">
        Checking the server…
      </Text>
    );
  }
  if (!detection || probedUrl !== url.trim()) {
    return null;
  }
  if (!detection.reachable) {
    return (
      <Text variant="body-small" color="secondary">
        Muster could not reach this address. Check it, or continue and test at
        the end.
      </Text>
    );
  }
  const transport =
    detection.transport === 'unknown'
      ? undefined
      : TRANSPORT_NAMES[detection.transport];
  return (
    <Flex direction="column" gap="1">
      <span className={classes.found}>
        <CheckIcon aria-hidden />
        Server found
      </span>
      <Text variant="body-small" color="secondary">
        {[
          detection.serverName &&
            `${detection.serverName}${
              detection.serverVersion ? ` ${detection.serverVersion}` : ''
            }`,
          transport,
          detection.requiresAuth
            ? 'asks for a sign-in — set up on the next step'
            : 'no sign-in needed',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Flex>
  );
}

/**
 * The shared validator words its problems for the classic wizard's fields
 * ("URL", "installation"); this step labels them "Server address" and, in the
 * agent area, "Environment". Say them in this step's words.
 */
function inStepWords(message: string | undefined): string | undefined {
  return message
    ?.replace(/^URL\b/, 'Server address')
    .replace(/^Select an installation$/, 'Select an environment');
}

/**
 * Step 1 (Connect) of the shell's connector wizard: the server address with a
 * live probe through muster's `core_mcpserver_detect` (the "Server found"
 * state), the connector's name and an optional description. The transport is
 * taken from the probe rather than asked — manual transport choice stays a
 * classic-wizard affair.
 *
 * The prototype's "Who can use it?" audience choice is deliberately absent:
 * muster registers a connector for the whole installation and has no
 * per-person visibility to map it to, so the wizard does not pretend to ask.
 */
export function NewConnectorConnectPage() {
  const navigate = useNavigate();
  const signInLink = useRouteRef(newMcpServerAuthRouteRef);
  const { activeInstallation } = useMusterInstance();
  const {
    state,
    setName,
    setDescription,
    setInstallation,
    setUrl,
    setTransport,
    detailsErrors,
    fieldErrors,
    registeredName,
  } = useNewMcpServerForm();

  // The wizard registers onto the section's active installation, mirrored into
  // the form state so validation and the composed definition see it — same
  // rule as the classic details step. Not while editing: that server lives
  // where it lives (NewMcpServerEditGate ends the edit on a switch).
  useEffect(() => {
    if (!registeredName && state.installation !== activeInstallation) {
      setInstallation(activeInstallation);
    }
  }, [registeredName, activeInstallation, state.installation, setInstallation]);

  // The detected transport is applied as long as this run has not been
  // registered yet; an edit keeps the transport the server is registered with,
  // so a re-probe of the unchanged URL cannot quietly switch it.
  const { detected } = useTransportDetection(state.url, state.installation);
  useEffect(() => {
    if (registeredName || !detected || state.transport === detected) {
      return;
    }
    setTransport(detected);
  }, [registeredName, detected, state.transport, setTransport]);

  // Each field shows its own problem once the person tries to proceed — not
  // before, so the form doesn't shout about empty fields up front — and a
  // blocked Continue moves the focus to the first one.
  const validation = useFieldValidation();
  const { reveal } = validation;
  const errorCount = detailsErrors.length;
  const onContinue = useCallback(() => {
    if (errorCount > 0) {
      reveal();
      return;
    }
    if (signInLink) {
      navigate(withEditParam(signInLink(), registeredName));
    }
  }, [errorCount, reveal, signInLink, navigate, registeredName]);
  // Problems no field on this step can show: the installation comes from the
  // section, request metadata is the classic wizard's. Named in a summary.
  const unanchoredErrors = [
    inStepWords(fieldErrors.installation),
    fieldErrors.meta,
  ].filter((error): error is string => Boolean(error));

  // Memoized so the frame's footer slot only updates when the handler does,
  // not on every keystroke (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onContinue}>
        Continue
      </Button>
    ),
    [onContinue],
  );
  useProvidePageHeaderActions(actions);

  return (
    <ConnectorWizardFrame step="connect">
      <WizardStepHeading
        title={registeredName ? 'Connection' : 'Connect an app'}
      >
        {registeredName
          ? 'Saving updates the registered connector in place.'
          : 'Gives agents access to an app through its MCP server. Paste the address from the app or your admin.'}
      </WizardStepHeading>

      <ActiveInstallationNote />

      <Flex direction="column" gap="2">
        <TextField
          label="Server address"
          isRequired
          value={state.url}
          onChange={setUrl}
          placeholder="https://mcp.example.com/mcp"
          {...fieldErrorProps(
            validation.errorFor(inStepWords(fieldErrors.url)),
          )}
        />
        <DetectionStatus url={state.url} installation={state.installation} />
      </Flex>

      {/* The technical name derives from this one, so its problems show here. */}
      <TextField
        label="Name"
        isRequired
        isDisabled={Boolean(registeredName)}
        value={state.name}
        onChange={setName}
        placeholder="e.g. Jira"
        description={
          registeredName
            ? 'It cannot be changed after registration.'
            : 'Shown when giving an agent access.'
        }
        {...fieldErrorProps(
          validation.errorFor(fieldErrors.name ?? fieldErrors.slug),
        )}
      />
      {!registeredName && state.slug && (
        <Text variant="body-small" color="secondary">
          Registered as <code>{state.slug}</code> — used in its tool names.
        </Text>
      )}

      <TextAreaField
        label="What does it give access to?"
        secondaryLabel="optional"
        value={state.description}
        onChange={setDescription}
        rows={2}
        placeholder="e.g. Search, read and update tickets"
        error={validation.errorFor(fieldErrors.description)}
      />

      {validation.shown && unanchoredErrors.length > 0 && (
        <Alert
          status="danger"
          title="Fix before continuing"
          description={unanchoredErrors.join('. ')}
        />
      )}
    </ConnectorWizardFrame>
  );
}
