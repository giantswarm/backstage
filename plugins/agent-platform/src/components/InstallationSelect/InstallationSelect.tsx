import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Alert, Card, CardBody, Flex, Link, Select, Text } from '@backstage/ui';
import { CircularProgress } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { useAgentManagerAvailability } from '../../hooks/useAgentManager';
import { musterToolExplorerExternalRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

const DESCRIPTION =
  'The management cluster this agent runs on. Determines which models are available and where the agent is deployed.';

/**
 * Card shell, so every branch below gets the same heading and description. The
 * heading names the field, so the controls inside use `aria-label` rather than a
 * visible label that would repeat it.
 */
function InstallationCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <SectionHeader title="Installation" description={DESCRIPTION} />
        {children}
      </CardBody>
    </Card>
  );
}

/**
 * Why an installation with models is still not offered: its muster lists no
 * agent-manager, and agents are created through agent-manager only.
 */
function NoAgentManagerNote({ installations }: { installations: string[] }) {
  if (installations.length === 0) {
    return null;
  }
  const list = installations.join(', ');
  return (
    <Alert
      status="info"
      title={
        installations.length === 1
          ? `No agent-manager on ${list}`
          : 'No agent-manager on some installations'
      }
      description={`Agents are created through agent-manager, reached through muster as you. muster on ${list} lists no agent-manager MCPServer, so agents cannot be created there. A platform admin enables the agent-manager component of the Agent Platform.`}
    />
  );
}

/**
 * Why an installation with models is not offered although it may have
 * agent-manager: its muster's server list couldn't be read (no muster session
 * there, or the read failed), so there is no answer either way. Links to the
 * muster Tool Explorer scoped to the installation, whose session gate is where
 * one signs in to that installation's muster.
 */
function AgentManagerUnknownNote({
  installations,
}: {
  installations: string[];
}) {
  const toolExplorerRoute = useRouteRef(musterToolExplorerExternalRouteRef);
  const signInHref = toolExplorerRoute
    ? (installation: string) =>
        `${toolExplorerRoute()}?installation=${encodeURIComponent(installation)}`
    : undefined;
  if (installations.length === 0) {
    return null;
  }
  const list = installations.join(', ');
  // `info`, not `warning`: not being signed in to some installations' muster
  // is an expected state, not something broken.
  return (
    <Alert
      status="info"
      title={
        installations.length === 1
          ? `Couldn't check ${list} for agent-manager`
          : "Couldn't check some installations for agent-manager"
      }
      description={
        <Flex direction="column" gap="1">
          <Text variant="body-small">
            Sign in to muster on {list} to check whether agents can be created
            there.
          </Text>
          {signInHref && (
            <Flex gap="3">
              {installations.map(installation => (
                <Link key={installation} href={signInHref(installation)}>
                  {installations.length === 1
                    ? 'Sign in to muster'
                    : `Sign in to muster on ${installation}`}
                </Link>
              ))}
            </Flex>
          )}
        </Flex>
      }
    />
  );
}

/**
 * Installations never asked for models: their cluster access isn't healthy, so
 * the fleet query skips them and nothing else would mention them.
 */
function InaccessibleInstallationsNote({
  installations,
}: {
  installations: string[];
}) {
  if (installations.length === 0) {
    return null;
  }
  const list = installations.join(', ');
  return (
    <Alert
      status="warning"
      title={
        installations.length === 1
          ? `Couldn't check ${list}`
          : `Couldn't check ${installations.length} installations`
      }
      description={`Cluster access to ${list} isn't healthy (session expired, unreachable, or not signed in), so whether agents can be created there is unknown. The Cluster access status in the sidebar shows why.`}
    />
  );
}

export function InstallationSelect() {
  const { state, setInstallation } = useNewAgentForm();
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const {
    isLoading,
    hasInstallations,
    availableInstallations,
    unreachableInstallations,
    inaccessibleInstallations,
  } = useModelConfigs();

  // Feature detection: an installation is offered only when its muster
  // registers agent-manager (`core_mcpserver_list`), read through the person's
  // own muster session — the same session Deploy will go through. There is no
  // fallback path without it.
  const agentManager = useAgentManagerAvailability(availableInstallations);
  const usableInstallations = useMemo(
    () =>
      availableInstallations.filter(
        name => agentManager.presenceOf(name) === 'available',
      ),
    [availableInstallations, agentManager],
  );
  const withoutAgentManager = agentManager.missing;
  // Installations whose server list read failed: no answer either way, so they
  // are neither offered nor covered by the no-agent-manager note. Only known
  // once the reads have settled (a read in flight is `unknown` too).
  const agentManagerUnknown = useMemo(
    () =>
      agentManager.isLoading || agentManager.isUnavailable
        ? []
        : availableInstallations.filter(
            name => agentManager.presenceOf(name) === 'unknown',
          ),
    [availableInstallations, agentManager],
  );

  // The sole installation on a single-management-cluster instance: there is
  // nothing to choose, so pick it for the user instead of offering a one-option
  // dropdown. Keyed on the configured list rather than the narrower "usable"
  // one, so the choice lands as soon as it is knowable.
  const singleConfigured =
    !isLoadingInstallations && installations.length === 1
      ? installations[0].name
      : undefined;
  const isSettling = isLoading || agentManager.isLoading;
  // Latched: `isLoading` includes the inventory's probing, which turns true
  // again on a cluster-access reconnect, and the sole-option line must not
  // flip back to a dropdown and forth each time.
  const hasSettled = useRef(false);
  if (!isLoadingInstallations && !isSettling) {
    hasSettled.current = true;
  }
  // Several installations configured, but once the fleet has settled only one
  // of them is usable: still no real choice, so pick it too. Only when every
  // installation with models has a definite agent-manager answer: one whose
  // server list couldn't be read may be usable, so the choice stays open.
  const singleUsable =
    hasSettled.current &&
    usableInstallations.length === 1 &&
    usableInstallations.length + withoutAgentManager.length ===
      availableInstallations.length
      ? usableInstallations[0]
      : undefined;
  const singleInstallation = singleConfigured ?? singleUsable;

  useEffect(() => {
    if (singleInstallation && state.installation !== singleInstallation) {
      setInstallation(singleInstallation);
    }
  }, [singleInstallation, state.installation, setInstallation]);

  // A pick that turned out not to have agent-manager (the server list answered
  // after the selection) is withdrawn: the review page could not deploy it.
  useEffect(() => {
    if (
      state.installation &&
      !singleInstallation &&
      agentManager.presenceOf(state.installation) === 'missing'
    ) {
      setInstallation(undefined);
    }
  }, [state.installation, singleInstallation, agentManager, setInstallation]);

  // Until the installations config resolves we don't know whether this field
  // belongs on the page at all — render nothing rather than a loading card that
  // would vanish a moment later on a single-installation instance.
  if (isLoadingInstallations) {
    return null;
  }

  // Something about an installation that is not offered needs saying.
  const hasNotes =
    unreachableInstallations.length > 0 ||
    withoutAgentManager.length > 0 ||
    agentManagerUnknown.length > 0 ||
    inaccessibleInstallations.length > 0;

  // Hide the field only once the sole installation proves usable. While the
  // fleet query is still settling we can't tell yet, so stay out of the way; if
  // it turns out to be unreachable, model-less or without agent-manager we fall
  // through, because the guidance below is then the only thing that explains
  // why the form is stuck. Only here: with several installations the card has
  // been on screen while they resolved, and removing it would shift the form.
  if (
    singleConfigured &&
    (isSettling || usableInstallations.length > 0) &&
    !hasNotes &&
    !agentManager.isUnavailable
  ) {
    return null;
  }

  const unreachableNote = (
    <UnreachableInstallationsAlert
      installations={unreachableInstallations}
      resourceName="ModelConfigs"
    />
  );
  const notes = (
    <>
      {unreachableNote}
      <InaccessibleInstallationsNote
        installations={inaccessibleInstallations}
      />
      <NoAgentManagerNote installations={withoutAgentManager} />
      <AgentManagerUnknownNote installations={agentManagerUnknown} />
    </>
  );

  if (agentManager.isUnavailable) {
    return (
      <InstallationCard>
        <Alert
          status="warning"
          title="The muster plugin is required"
          description="Agents are created through agent-manager's tools over muster as the signed-in person, and this portal has no muster plugin installed. Nothing can be created from here."
        />
      </InstallationCard>
    );
  }

  // Installations resolve one by one across the fleet, so offer each as soon as
  // it responds rather than waiting for the slowest one. Only fall back to the
  // loading/empty states while nothing is available yet.
  if (usableInstallations.length === 0) {
    if (isSettling) {
      return (
        <InstallationCard>
          <Flex direction="column" gap="2">
            <Select
              aria-label="Installation"
              isRequired
              isDisabled
              icon={<CircularProgress size={16} color="inherit" />}
              options={[]}
              placeholder="Finding installations with models and agent-manager…"
            />
            <NoAgentManagerNote installations={withoutAgentManager} />
          </Flex>
        </InstallationCard>
      );
    }

    if (hasInstallations) {
      return (
        <InstallationCard>
          <Flex direction="column" gap="2">
            {/* If every queried installation errored, the warning explains it;
                only claim "no models" when reads actually succeeded. */}
            {notes}
            {!hasNotes && (
              <Alert
                status="info"
                title="No installations with models"
                description="None of the reachable installations have a kagent ModelConfig provisioned yet. A platform admin needs to add one before you can create an agent."
              />
            )}
          </Flex>
        </InstallationCard>
      );
    }
  }

  // Only one usable installation out of several: it is picked above, so say
  // where the agent runs instead of offering a one-option dropdown. The card
  // stays (it was on screen while the fleet resolved), and so do the notes on
  // the others.
  if (singleUsable) {
    return (
      <InstallationCard>
        <Flex direction="column" gap="2">
          <Text>
            Runs on <strong>{singleUsable}</strong>, the only installation with
            models and agent-manager.
          </Text>
          {notes}
        </Flex>
      </InstallationCard>
    );
  }

  return (
    <InstallationCard>
      <Flex direction="column" gap="2">
        <Select
          aria-label="Installation"
          isRequired
          options={usableInstallations.map(name => ({
            id: name,
            label: name,
          }))}
          selectedKey={state.installation ?? null}
          onSelectionChange={key =>
            setInstallation(key ? String(key) : undefined)
          }
        />
        {/* The list grows as slower installations respond, so say so rather than
            letting a short list look complete. */}
        {isSettling && (
          <Text variant="body-small" color="secondary">
            Still checking the remaining installations…
          </Text>
        )}
        {notes}
      </Flex>
    </InstallationCard>
  );
}
