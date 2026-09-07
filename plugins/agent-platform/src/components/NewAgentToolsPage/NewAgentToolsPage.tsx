import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  SearchField,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetPresets } from '../../hooks/useToolsetPresets';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  buildCatalogue,
  MAX_INLINE_SELECTORS,
  selectorProblem,
  toolsetShape,
  unsignedServerSelectors,
} from '../../lib/toolset';
import {
  newAgentReviewRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
} from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { ToolsetResolutionList } from '../ToolsetResolutionList';
import { CopyFromAgent } from './CopyFromAgent';
import { filterCatalogue } from './filterCatalogue';
import { PresetCards } from './PresetCards';
import { ToolCatalogue } from './ToolCatalogue';

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
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  sectionDescription: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  footerNote: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  details: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
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
  selectors: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  selector: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontFamily: 'monospace',
    fontSize: 13,
    padding: theme.spacing(0.25, 1),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
  },
  removeSelector: {
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    lineHeight: 1,
    padding: 0,
  },
}));

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const classes = useStyles();
  return (
    <>
      <Text
        as="h3"
        variant="title-small"
        weight="bold"
        className={classes.sectionTitle}
      >
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.sectionDescription}>
        {description}
      </Text>
    </>
  );
}

/** The current toolset as removable selector chips — the step's own output, always visible. */
function SelectedToolset({
  selectors,
  onRemove,
}: {
  selectors: string[];
  onRemove: (selector: string) => void;
}) {
  const classes = useStyles();
  if (selectors.length === 0) {
    return (
      <Text color="secondary">
        Nothing selected yet. The agent gets no tool access you did not add
        here.
      </Text>
    );
  }
  return (
    <div className={classes.selectors} role="list" aria-label="Toolset">
      {selectors.map(selector => (
        <span key={selector} className={classes.selector} role="listitem">
          {selector}
          <button
            type="button"
            className={classes.removeSelector}
            aria-label={`Remove ${selector}`}
            onClick={() => onRemove(selector)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function NewAgentToolsPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const skillsLink = useRouteRef(newAgentSkillsRouteRef);
  const reviewLink = useRouteRef(newAgentReviewRouteRef);
  const {
    state,
    toggleToolsetSelector,
    setToolset,
    isComplete,
    isToolsetChosen,
    toolsetProblems,
  } = useNewAgentForm();
  // Cached by now; only decides where "Back" goes and what the step is numbered.
  const { hasRepositories } = useSkillCatalog();

  const installation = state.installation;
  const musterApi = useMusterPluginApi();
  const presets = useToolsetPresets(installation);
  const catalogue = useMusterToolCatalogue(installation);
  const { servers, isLoading: isLoadingServers } =
    useMusterServers(installation);
  const resolution = useToolsetResolution(installation, state.toolset);

  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const groups = useMemo(
    () =>
      buildCatalogue(catalogue.tools, servers, catalogue.serversRequiringAuth),
    [catalogue.tools, servers, catalogue.serversRequiringAuth],
  );
  const visibleGroups = useMemo(
    () => filterCatalogue(groups, trimmed),
    [groups, trimmed],
  );
  const selected = useMemo(() => new Set(state.toolset), [state.toolset]);
  const unsigned = useMemo(
    () => unsignedServerSelectors(state.toolset, groups),
    [state.toolset, groups],
  );
  const shape = toolsetShape(state.toolset);

  // A selector typed by hand: how a power user adds `server:x` on a portal
  // without the muster plugin, or a tool they know by name. Validated against
  // the same grammar the chart and agent-manager enforce.
  const [manualSelector, setManualSelector] = useState('');
  const [manualProblem, setManualProblem] = useState<string | undefined>();
  const addManualSelector = useCallback(() => {
    const value = manualSelector.trim();
    const problem = selectorProblem(value);
    if (problem) {
      setManualProblem(problem);
      return;
    }
    setManualProblem(undefined);
    setManualSelector('');
    if (!state.toolset.includes(value)) {
      toggleToolsetSelector(value);
    }
  }, [manualSelector, state.toolset, toggleToolsetSelector]);

  const backLink = hasRepositories ? skillsLink : newAgentLink;
  const stepNumber = hasRepositories ? 3 : 2;
  const totalSteps = hasRepositories ? 4 : 3;

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => navigate(backLink ? backLink() : '..')}
        >
          Back
        </Button>
        <Button
          variant="primary"
          isDisabled={!isToolsetChosen}
          onPress={() => reviewLink && navigate(reviewLink())}
        >
          Continue
        </Button>
      </Flex>
    ),
    [backLink, reviewLink, navigate, isToolsetChosen],
  );

  useProvidePageHeaderActions(isComplete ? actions : null);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  const isCatalogueLoading =
    Boolean(musterApi) && (catalogue.isLoading || isLoadingServers);

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step {stepNumber} of {totalSteps}: Tools
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Choose the agent's tools
        </Text>
        <Text as="p" className={classes.intro}>
          The toolset bounds which of the gateway's tools this agent can
          discover and call, within whatever the person using it may reach
          themselves. Start from a preset, then add servers, workflows or
          individual tools — or choose <strong>No tools</strong> for a chat-only
          agent. Required: nothing is granted until you add it.
        </Text>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <SectionTitle
                title="Presets"
                description="Named selections the platform defines. Read-only tools is the safe default; Full gateway is today's unbounded behaviour, made explicit."
              />
              <Flex direction="column" gap="3">
                {presets.source === 'built-in' && musterApi && installation && (
                  <Alert
                    status="info"
                    title="Only the built-in presets are known"
                    description={
                      presets.error
                        ? `The installation's muster could not be asked for its presets (${presets.error}). The three presets built into every muster are offered.`
                        : "This installation's muster did not list its presets — it may predate toolsets. The three presets built into every muster are offered."
                    }
                  />
                )}
                <PresetCards
                  presets={presets.presets}
                  selected={selected}
                  onToggle={toggleToolsetSelector}
                />
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionTitle
                title="Start from an existing agent"
                description="Copy another agent's toolset into this step, then adjust it."
              />
              <details className={classes.details}>
                <summary className={classes.summaryLine}>
                  Agents on {installation} with a declared toolset
                </summary>
                <div className={classes.detailsBody}>
                  <CopyFromAgent
                    installation={installation}
                    current={state.toolset}
                    onCopy={setToolset}
                  />
                </div>
              </details>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionTitle
                title="Catalogue"
                description="Every server the gateway aggregates, grouped as Infrastructure, Agent Platform, Registered servers and Workflows. Select a whole server, or expand it and pick individual tools."
              />
              <Flex direction="column" gap="3">
                {!musterApi && (
                  <Alert
                    status="info"
                    title="The catalogue is not available in this portal"
                    description="The muster plugin is not installed here, so servers and tools cannot be browsed. Choose a preset above, or add selectors by name below."
                  />
                )}
                {musterApi && catalogue.error && (
                  <Alert
                    status="warning"
                    title="Could not read the gateway's catalogue"
                    description={catalogue.error}
                  />
                )}
                {isCatalogueLoading && groups.length === 0 && (
                  <Text color="secondary">Reading the catalogue…</Text>
                )}
                {groups.length > 0 && (
                  <>
                    <Flex
                      align="center"
                      justify="between"
                      gap="2"
                      style={{ flexWrap: 'wrap' }}
                    >
                      <Flex grow basis="240px" direction="column">
                        <SearchField
                          aria-label="Search tools"
                          placeholder="Search servers, tools and workflows…"
                          value={query}
                          onChange={setQuery}
                        />
                      </Flex>
                      <Text variant="body-small" color="secondary">
                        {state.toolset.length} selected
                      </Text>
                    </Flex>
                    {visibleGroups.length > 0 ? (
                      <ToolCatalogue
                        groups={visibleGroups}
                        query={trimmed}
                        installation={installation}
                        signInAvailable={Boolean(musterApi)}
                        selected={selected}
                        onToggle={toggleToolsetSelector}
                      />
                    ) : (
                      <Text color="secondary">
                        Nothing matches &quot;{trimmed}&quot;.
                      </Text>
                    )}
                  </>
                )}

                <details className={classes.details}>
                  <summary className={classes.summaryLine}>
                    Add a selector by name
                  </summary>
                  <div className={classes.detailsBody}>
                    <Text variant="body-small" color="secondary">
                      <span style={{ fontFamily: 'monospace' }}>
                        preset:&lt;name&gt;
                      </span>
                      ,{' '}
                      <span style={{ fontFamily: 'monospace' }}>
                        server:&lt;name&gt;
                      </span>
                      ,{' '}
                      <span style={{ fontFamily: 'monospace' }}>
                        workflow:&lt;name&gt;
                      </span>{' '}
                      or{' '}
                      <span style={{ fontFamily: 'monospace' }}>
                        tool:&lt;exposed name&gt;
                      </span>
                      , with the exact name.
                    </Text>
                    <Flex align="end" gap="2" style={{ flexWrap: 'wrap' }}>
                      <Flex grow basis="240px" direction="column">
                        <TextField
                          label="Selector"
                          value={manualSelector}
                          onChange={value => {
                            setManualSelector(value);
                            setManualProblem(undefined);
                          }}
                          placeholder="server:pro"
                        />
                      </Flex>
                      <Button variant="secondary" onPress={addManualSelector}>
                        Add selector
                      </Button>
                    </Flex>
                    {manualProblem && (
                      <Alert
                        status="danger"
                        title="Not a selector"
                        description={manualProblem}
                      />
                    )}
                  </div>
                </details>
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionTitle
                title="Toolset"
                description="What you have selected, and the tools it resolves to for you right now. The review step shows the same list."
              />
              <Flex direction="column" gap="3">
                <SelectedToolset
                  selectors={state.toolset}
                  onRemove={toggleToolsetSelector}
                />
                {toolsetProblems.length > 0 && (
                  <Alert
                    status="danger"
                    title={
                      state.toolset.length > MAX_INLINE_SELECTORS
                        ? 'Too many selectors — define a preset'
                        : 'The toolset cannot be applied as it is'
                    }
                    description={toolsetProblems.join(' ')}
                  />
                )}
                {shape === 'none' && (
                  <Alert
                    status="info"
                    title="No tools"
                    description="A chat-only agent: it gets no gateway entry at all and works from its prompt and skills alone."
                  />
                )}
                {shape === 'full' && (
                  <Alert
                    status="warning"
                    title="Full gateway access"
                    description="This agent can discover and call every tool the gateway exposes to whoever invokes it — platform administration included."
                  />
                )}
                {unsigned.length > 0 && (
                  <Alert
                    status="info"
                    title="Selected without a sign-in"
                    description={`${unsigned.join(
                      ', ',
                    )} — these servers are part of the toolset and resolve for people who have access to them. For you, the resolved list below is incomplete until you sign in to them.`}
                  />
                )}
                <ToolsetResolutionList
                  resolution={resolution}
                  servers={servers}
                  emptyText={
                    shape === 'none'
                      ? 'No tools, as chosen.'
                      : 'This toolset resolves to no tools for you right now.'
                  }
                />
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" color="secondary" className={classes.footerNote}>
                  {isToolsetChosen
                    ? 'The next step composes the Helm values and manifests so you can review them before the agent is deployed.'
                    : 'Choose a preset or compose a toolset to continue — No tools is a choice too.'}
                </Text>
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
