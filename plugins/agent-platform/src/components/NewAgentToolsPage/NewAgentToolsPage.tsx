import { useCallback, useMemo, useRef, useState } from 'react';
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
  catalogueInventory,
  countNoun,
  declaredToolset,
  MAX_INLINE_SELECTORS,
  selectorProblem,
  toolsetShape,
  type ToolsetShape,
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
import { ToolsetSummaryBar } from './ToolsetSummaryBar';

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
  afterPresets: {
    marginTop: theme.spacing(2),
  },
}));

/** The line above the step's actions: what happens next, or what blocks it. */
function footerNote(isToolsetValid: boolean, shape: ToolsetShape): string {
  if (!isToolsetValid) {
    return 'Fix the toolset to continue.';
  }
  const next =
    'The next step composes the Helm values and manifests so you can review them before the agent is deployed.';
  if (shape === 'none') {
    return `Nothing selected: the agent is created without tools. ${next}`;
  }
  return next;
}

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
    isToolsetValid,
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
  // The catalogue is the second path, behind the presets: opened on request,
  // or by a search — typing is asking to see what matches.
  const [browsing, setBrowsing] = useState(false);
  const showCatalogue = browsing || trimmed !== '';

  const groups = useMemo(
    () =>
      buildCatalogue(catalogue.tools, servers, catalogue.serversRequiringAuth),
    [catalogue.tools, servers, catalogue.serversRequiringAuth],
  );
  const visibleGroups = useMemo(
    () => filterCatalogue(groups, trimmed),
    [groups, trimmed],
  );
  const inventory = useMemo(() => catalogueInventory(groups), [groups]);
  const matches = useMemo(
    () => catalogueInventory(visibleGroups),
    [visibleGroups],
  );
  const selected = useMemo(() => new Set(state.toolset), [state.toolset]);
  const unsigned = useMemo(
    () => unsignedServerSelectors(state.toolset, groups),
    [state.toolset, groups],
  );
  // The empty selection is no tools: the shape is that of what will be declared.
  const shape = toolsetShape(declaredToolset(state.toolset));

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

  // The summary bar stays in view; the full resolved list is one click down.
  const resolvedListRef = useRef<HTMLDivElement>(null);
  const showResolvedList = useCallback(() => {
    resolvedListRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

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
          isDisabled={!isToolsetValid}
          onPress={() => reviewLink && navigate(reviewLink())}
        >
          Continue
        </Button>
      </Flex>
    ),
    [backLink, reviewLink, navigate, isToolsetValid],
  );

  useProvidePageHeaderActions(isComplete ? actions : null);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  const isCatalogueLoading =
    Boolean(musterApi) && (catalogue.isLoading || isLoadingServers);

  const inventoryLine =
    trimmed === ''
      ? `${countNoun(inventory.servers, 'server')} · ${countNoun(
          inventory.tools + inventory.platformAdministration,
          'tool',
        )} · ${countNoun(inventory.workflows, 'workflow')}`
      : `${countNoun(
          matches.tools + matches.platformAdministration,
          'tool',
        )} and ${countNoun(matches.workflows, 'workflow')} match`;

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
          themselves. Start from a preset — <strong>Read-only tools</strong>{' '}
          fits most agents — and add servers, workflows or single tools from the
          catalogue if you need more. Nothing is granted until you add it: with
          nothing selected the agent has <strong>no tools</strong> and works
          from its prompt and skills alone.
        </Text>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <SectionTitle
                title="Presets"
                description="Named selections the platform defines. Read-only tools is the safe default; Full gateway is today's unbounded behaviour, made explicit. A preset combines with anything you add from the catalogue."
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
              <details className={`${classes.details} ${classes.afterPresets}`}>
                <summary className={classes.summaryLine}>
                  Or start from an existing agent's toolset
                </summary>
                <div className={classes.detailsBody}>
                  <Text variant="body-small" color="secondary">
                    Copy another agent's toolset into this step, then adjust it.
                    Agents on {installation} with a declared toolset:
                  </Text>
                  <CopyFromAgent
                    installation={installation}
                    current={state.toolset}
                    onCopy={setToolset}
                  />
                </div>
              </details>
            </CardBody>
          </Card>

          <ToolsetSummaryBar
            selectors={state.toolset}
            onRemove={toggleToolsetSelector}
            resolution={resolution}
            unsigned={unsigned}
            problems={toolsetProblems}
            onShowDetails={showResolvedList}
          />

          <Card>
            <CardBody>
              <SectionTitle
                title="Catalogue"
                description="Every server the gateway aggregates and every workflow it runs, grouped as Infrastructure, Agent Platform, Registered servers and Workflows. Search across all of it, or browse group by group; select a whole server, or open it and pick single tools."
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
                    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                      <Flex grow basis="240px" direction="column">
                        <SearchField
                          aria-label="Search tools"
                          placeholder="Search servers, tools and workflows…"
                          value={query}
                          onChange={setQuery}
                        />
                      </Flex>
                      {trimmed === '' ? (
                        <Button
                          variant="secondary"
                          size="small"
                          aria-expanded={browsing}
                          onPress={() => setBrowsing(value => !value)}
                        >
                          {browsing
                            ? 'Hide the catalogue'
                            : 'Browse the catalogue'}
                        </Button>
                      ) : (
                        <Button
                          variant="tertiary"
                          size="small"
                          onPress={() => setQuery('')}
                        >
                          Show everything again
                        </Button>
                      )}
                      <Text variant="body-small" color="secondary">
                        {inventoryLine}
                      </Text>
                    </Flex>
                    {showCatalogue &&
                      (visibleGroups.length > 0 ? (
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
                      ))}
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
              <div ref={resolvedListRef}>
                <SectionTitle
                  title="Toolset"
                  description="What your selection resolves to for you right now, grouped like the catalogue. The review step shows the same list."
                />
              </div>
              <Flex direction="column" gap="3">
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
                    description="Nothing is selected, so this is a chat-only agent: it gets no gateway entry at all and works from its prompt and skills alone. Add a preset or pick from the catalogue to give it tools."
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
                />
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" color="secondary" className={classes.footerNote}>
                  {footerNote(isToolsetValid, shape)}
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
