import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Button, Flex, Select, Text } from '@backstage/ui';
import { CircularProgress } from '@material-ui/core';
import {
  joinNames,
  NAMED_IN_SENTENCE,
  ExternalLink,
  searchableIf,
  ShowMore,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useHomeInstallation,
  useInstallations,
} from '@giantswarm/backstage-plugin-gs';
import { withQuery } from '@giantswarm/backstage-plugin-muster';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { useAgentManagerAvailability } from '../../hooks/useAgentManager';
import { musterServersExternalRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { SharedIdentityNote } from '../SharedIdentityNote';
import { useModelConfigs } from '../ModelConfigsProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { LabelledField } from '../LabelledField';

const LABEL = 'Environment';

const DESCRIPTION =
  'Choose the management cluster the agent runs on; it decides which models are available.';

/** How many installations a note names, and links to, before the rest are a count. */
const NAMED_INSTALLATIONS = NAMED_IN_SENTENCE;

/** No installations while editing: an existing agent stays where it is. */
const NONE: string[] = [];

/**
 * Why an installation with models is still not offered: its muster lists no
 * agent-manager, and agents are created through agent-manager only.
 */
function NoAgentManagerNote({ installations }: { installations: string[] }) {
  if (installations.length === 0) {
    return null;
  }
  const list = joinNames(installations);
  return (
    <Alert
      status="info"
      title={
        installations.length === 1
          ? `No agent-manager on ${list}`
          : 'No agent-manager on some environments'
      }
      description={`muster on ${list} lists no agent-manager, so agents cannot be created there. A platform admin can enable the Agent Platform's agent-manager component.`}
    />
  );
}

/**
 * Why an installation with models is not offered although it may have
 * agent-manager: its muster's server list couldn't be read (no muster session
 * there, or the read failed), so there is no answer either way. Says what that
 * means for the agent being created, and links to muster's MCP Servers tab
 * scoped to the installation, whose session gate is where one signs in to that
 * installation's muster: in a new tab, so the form stays as it is, and "Check
 * again" reads the lists anew once the person is back.
 */
function AgentManagerUnknownNote({
  installations,
  isChecking,
  onRecheck,
}: {
  installations: string[];
  /** A Check again is reading the lists: the note stays, its button busy. */
  isChecking: boolean;
  onRecheck: () => void;
}) {
  const serversRoute = useRouteRef(musterServersExternalRouteRef);
  const signInHref = serversRoute
    ? (installation: string) => withQuery(serversRoute(), { installation })
    : undefined;
  if (installations.length === 0) {
    return null;
  }
  const list = joinNames(installations);
  const isOne = installations.length === 1;
  // `info`, not `warning`: not being signed in to some installations' muster
  // is an expected state, not something broken.
  return (
    <Alert
      status="info"
      title={
        isOne
          ? `Could not check ${list} for agent-manager`
          : 'Could not check some environments for agent-manager'
      }
      description={
        <Flex direction="column" gap="2" align="start">
          <Text variant="body-small">
            {isOne
              ? `${list} is not offered for this agent until it is checked.`
              : 'They are not offered for this agent until they are checked.'}{' '}
            Sign in to muster on {list} to check whether agents can be created
            there, then check again. What you entered here stays.
          </Text>
          {/* One link per installation, wrapping, the first few shown: on a
              fleet of 50 where signed-out is the norm, a row of every link
              would run off the alert. */}
          {signInHref && (
            <ShowMore
              items={installations}
              initial={NAMED_INSTALLATIONS}
              noun="environment"
              revealAll
            >
              {visible => (
                <Flex gap="3" style={{ flexWrap: 'wrap' }}>
                  {visible.map(installation => (
                    <ExternalLink
                      key={installation}
                      href={signInHref(installation)}
                    >
                      {isOne
                        ? 'Sign in to muster'
                        : `Sign in to muster on ${installation}`}
                    </ExternalLink>
                  ))}
                </Flex>
              )}
            </ShowMore>
          )}
          <Button
            size="small"
            variant="secondary"
            isPending={isChecking}
            onPress={onRecheck}
          >
            Check again
          </Button>
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
  const list = joinNames(installations);
  return (
    <Alert
      status="warning"
      title={
        installations.length === 1
          ? `Could not check ${list}`
          : `Could not check ${installations.length} environments`
      }
      description={`Cluster access to ${list} is not healthy (session expired, unreachable or not signed in), so it's unknown whether agents can be created there, and ${
        installations.length === 1 ? 'it is' : 'they are'
      } not offered for this agent. See Cluster access in the sidebar.`}
    />
  );
}

export type EnvironmentFieldOptions = {
  /**
   * The field's validation problem, shown on the dropdown once the form wants
   * it seen. Where no dropdown renders (one usable installation, or none) the
   * notes under the label already say why nothing is picked.
   */
  error?: string;
};

export type EnvironmentField = {
  /**
   * Whether the field puts itself and Organization in the main form: a real
   * choice, or a state that says why there is none. Otherwise it is a line
   * (or nothing) that goes wherever Organization goes.
   */
  inMain: boolean;
  /**
   * The portal's only environment: a line under More options whatever
   * Organization does, not one of the pair.
   */
  alone?: boolean;
  /** The field itself, for the page to put directly before Organization. */
  field: ReactNode;
};

/**
 * The New agent form's Environment field: the installations agents can be
 * created on.
 *
 * - One installation configured: picked, and named in a line of its own
 *   under More options.
 * - Several, one of them usable: picked, and named in a line.
 * - Several usable: a dropdown, always with one picked: the home installation
 *   (`useHomeInstallation`) once it is known to be usable, else, once the
 *   fleet has settled, the first usable one in config order. A pick of the
 *   person's own is never replaced.
 * - None usable: the states that explain why nothing can be chosen.
 *
 * Once the field has shown a dropdown or a state (while the fleet settles,
 * say), it keeps the pair in the main form, so a sole usable environment
 * found later does not move what the person has seen into More options.
 *
 * A hook rather than a component, so the page mounts it once and places its
 * field: its effects pick the default while More options is closed, and a
 * component moved between the two places would remount, losing its settled
 * latch and a Check again in flight. Inert while editing: an existing agent
 * stays where it is.
 */
export function useEnvironmentField({
  error,
}: EnvironmentFieldOptions = {}): EnvironmentField {
  const { state, edit, setInstallation } = useNewAgentForm();
  const selectError = useSelectFieldError(error);
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const home = useHomeInstallation().home?.name;
  const {
    isLoading,
    hasInstallations,
    availableInstallations: fleetInstallations,
    unreachableInstallations,
    inaccessibleInstallations,
  } = useModelConfigs();
  const availableInstallations = edit ? NONE : fleetInstallations;

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
  const withSharedIdentity = agentManager.sharedIdentity;
  // Installations whose server list read failed: no answer either way, so they
  // are neither offered nor covered by the no-agent-manager note. Only known
  // once the reads have settled (a read in flight is `unknown` too).
  const settledUnknown = useMemo(
    () =>
      agentManager.isLoading || agentManager.isUnavailable
        ? []
        : availableInstallations.filter(
            name => agentManager.presenceOf(name) === 'unknown',
          ),
    [availableInstallations, agentManager],
  );
  // The installations a Check again is reading anew. A failed read refetched
  // is pending again (it has no data to keep), so without this the note --
  // with the button just pressed -- and the field's settled state would drop
  // out until the reads answer; the note stays as it was instead.
  const [rechecking, setRechecking] = useState<string[]>();
  const agentManagerUnknown = rechecking ?? settledUnknown;
  const { recheck } = agentManager;
  const recheckUnknown = useCallback(() => {
    setRechecking(settledUnknown);
    recheck().finally(() => setRechecking(undefined));
  }, [recheck, settledUnknown]);

  // The sole installation on a single-management-cluster instance: there is
  // nothing to choose, so pick it for the user instead of offering a one-option
  // dropdown. Keyed on the configured list rather than the narrower "usable"
  // one, so the choice lands as soon as it is knowable.
  const singleConfigured =
    !edit && !isLoadingInstallations && installations.length === 1
      ? installations[0].name
      : undefined;
  const isSettling = isLoading || (agentManager.isLoading && !rechecking);
  // Latched: `isLoading` includes the inventory's probing, which turns true
  // again on a cluster-access reconnect, and the sole-option line must not
  // flip back to a dropdown and forth each time.
  const hasSettled = useRef(false);
  if (!isLoadingInstallations && !isSettling) {
    hasSettled.current = true;
  }
  // Whether the field has held the pair in the main form (see above):
  // latched from what was committed, not from a render that may be dropped.
  const [shownInMain, setShownInMain] = useState(false);
  // Several installations configured, but once the fleet has settled only one
  // of them is usable: still no real choice, so pick it too. Only when every
  // installation with models has a definite agent-manager answer: one whose
  // server list couldn't be read may be usable, so the choice stays open.
  const singleUsable =
    hasSettled.current &&
    usableInstallations.length === 1 &&
    usableInstallations.length +
      withoutAgentManager.length +
      withSharedIdentity.length ===
      availableInstallations.length
      ? usableInstallations[0]
      : undefined;
  // Muster answered that agents cannot be created there: never picked, not
  // even as the sole installation, so the form cannot go on to a Deploy that
  // agent-manager would refuse.
  const isWithheld = (installation: string) => {
    const presence = agentManager.presenceOf(installation);
    return presence === 'missing' || presence === 'sharedIdentity';
  };
  const singleInstallation =
    singleConfigured && !isWithheld(singleConfigured)
      ? singleConfigured
      : singleUsable;

  useEffect(() => {
    if (singleInstallation && state.installation !== singleInstallation) {
      setInstallation(singleInstallation);
    }
  }, [singleInstallation, state.installation, setInstallation]);

  // The default, picked while nothing is (so a pick of the person's own, or
  // a restored draft's, stays; a withdrawn one is replaced by it): the home
  // installation once it is known to be usable; else, once the fleet has
  // settled, the first usable one in config order. Never before: which
  // installation answers first must not decide the pick.
  let defaultInstallation: string | undefined;
  if (!edit) {
    if (home && usableInstallations.includes(home)) {
      defaultInstallation = home;
    } else if (hasSettled.current) {
      defaultInstallation = installations
        .map(({ name }) => name)
        .find(name => usableInstallations.includes(name));
    }
  }
  useEffect(() => {
    if (defaultInstallation && !state.installation && !singleInstallation) {
      setInstallation(defaultInstallation);
    }
  }, [
    defaultInstallation,
    singleInstallation,
    state.installation,
    setInstallation,
  ]);

  // A pick that turned out not to be usable (the server list or the
  // installations answered after the selection) is withdrawn: the review page
  // could not deploy it.
  // A usable sole installation replaces it instead (the effect above).
  useEffect(() => {
    if (
      state.installation &&
      !singleInstallation &&
      isWithheld(state.installation)
    ) {
      setInstallation(undefined);
    }
    // `isWithheld` reads `agentManager`, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.installation, singleInstallation, agentManager, setInstallation]);

  const result = ((): EnvironmentField => {
    // Until the installations config resolves we don't know whether this field
    // belongs on the page at all — render nothing rather than a loading field
    // that would vanish a moment later on a single-installation instance.
    if (edit || isLoadingInstallations) {
      return { inMain: false, field: null };
    }

    // Something about an installation that is not offered needs saying.
    const hasNotes =
      unreachableInstallations.length > 0 ||
      withoutAgentManager.length > 0 ||
      withSharedIdentity.length > 0 ||
      agentManagerUnknown.length > 0 ||
      inaccessibleInstallations.length > 0;

    const unreachableNote = (
      <UnreachableInstallationsAlert
        installations={unreachableInstallations}
        resourceName="model configs"
        consequence={
          unreachableInstallations.length === 1
            ? 'It is not offered for this agent.'
            : 'They are not offered for this agent.'
        }
      />
    );
    const notes = (
      <>
        {unreachableNote}
        <InaccessibleInstallationsNote
          installations={inaccessibleInstallations}
        />
        <NoAgentManagerNote installations={withoutAgentManager} />
        <SharedIdentityNote
          installations={withSharedIdentity}
          blocked="Agents cannot be created"
          via="Agents are created through agent-manager"
        />
        <AgentManagerUnknownNote
          installations={agentManagerUnknown}
          isChecking={rechecking !== undefined}
          onRecheck={recheckUnknown}
        />
      </>
    );

    const main = (field: ReactNode): EnvironmentField => ({
      inMain: true,
      field,
    });

    // The only usable environment: nothing to choose, so a line says where
    // the agent runs, with the notes on the others.
    const soleField = (sole: string): EnvironmentField => ({
      inMain: shownInMain,
      field: (
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-small" color="secondary">
            Runs in Environment: <strong>{sole}</strong>
          </Text>
          {notes}
        </Flex>
      ),
    });

    // The sole configured installation is picked and named, once it proves
    // usable or while the fleet query is still settling. If it
    // turns out to be unreachable, model-less or without agent-manager we fall
    // through, because the guidance below is then the only thing that explains
    // why the form is stuck.
    if (
      singleConfigured &&
      (isSettling || usableInstallations.length > 0) &&
      !hasNotes &&
      !agentManager.isUnavailable
    ) {
      return {
        inMain: false,
        alone: true,
        field: (
          <Text as="p" variant="body-small" color="secondary">
            Runs in Environment: <strong>{singleConfigured}</strong>
          </Text>
        ),
      };
    }

    if (agentManager.isUnavailable) {
      return main(
        <LabelledField label={LABEL} description={DESCRIPTION}>
          <Alert
            status="warning"
            title="The muster plugin is required"
            description="Agents are created through agent-manager over muster, and this portal has no muster plugin installed."
          />
        </LabelledField>,
      );
    }

    // Installations resolve one by one across the fleet, so offer each as soon as
    // it responds rather than waiting for the slowest one. Only fall back to the
    // loading/empty states while nothing is available yet.
    if (usableInstallations.length === 0) {
      if (isSettling) {
        return main(
          <Flex direction="column" gap="2">
            <Select
              label={LABEL}
              description={DESCRIPTION}
              isRequired
              isDisabled
              icon={<CircularProgress size={16} color="inherit" />}
              options={[]}
              placeholder="Finding environments with models and agent-manager…"
              {...selectError.selectProps}
            />
            {selectError.message}
            <NoAgentManagerNote installations={withoutAgentManager} />
            <SharedIdentityNote
              installations={withSharedIdentity}
              blocked="Agents cannot be created"
              via="Agents are created through agent-manager"
            />
          </Flex>,
        );
      }

      if (hasInstallations) {
        return main(
          <LabelledField label={LABEL} description={DESCRIPTION}>
            {/* If every queried installation errored, the warning explains it;
              only claim "no models" when reads actually succeeded. */}
            {notes}
            {!hasNotes && (
              <Alert
                status="info"
                title="No environments with models"
                description="No reachable environment has a kagent ModelConfig yet. A platform admin must add one before agents can be created."
              />
            )}
          </LabelledField>,
        );
      }
    }

    // Only one usable installation out of several: it is picked above, so it is
    // named in a line instead of offered in a one-option dropdown. Latched (see `hasSettled`),
    // so it changes once, when the fleet settles.
    if (singleUsable) {
      return soleField(singleUsable);
    }

    return main(
      <Flex direction="column" gap="2">
        <Select
          label={LABEL}
          description={DESCRIPTION}
          isRequired
          searchable={searchableIf(usableInstallations)}
          options={usableInstallations.map(name => ({
            id: name,
            label: name,
          }))}
          // The default shows until its pick lands, rather than a placeholder.
          selectedKey={state.installation ?? defaultInstallation ?? null}
          placeholder={
            !defaultInstallation && !state.installation
              ? `Checking ${home ?? 'the environments'}…`
              : undefined
          }
          onSelectionChange={key =>
            setInstallation(key ? String(key) : undefined)
          }
          {...selectError.selectProps}
        />
        {selectError.message}
        {/* The list grows as slower installations respond, so say so rather than
          letting a short list look complete. */}
        {isSettling && (
          <Text variant="body-small" color="secondary">
            Still checking the remaining environments…
          </Text>
        )}
        {notes}
      </Flex>,
    );
  })();

  const holdsMain = result.inMain;
  useEffect(() => {
    if (holdsMain) {
      setShownInMain(true);
    }
  }, [holdsMain]);
  return result;
}
