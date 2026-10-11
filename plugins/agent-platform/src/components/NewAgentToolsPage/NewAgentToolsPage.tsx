import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
import {
  CatalogFilterBar,
  LoadingIndicator,
  useProvidePageHeaderActions,
  useWizardFrameRail,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetPresets } from '../../hooks/useToolsetPresets';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import { filterCatalogue } from '../../lib/filterCatalogue';
import {
  buildCatalogue,
  catalogueInventory,
  countNoun,
  MAX_INLINE_SELECTORS,
  presetNameOf,
  presetSelector,
  PRESET_FULL,
  selectorProblem,
  type ServerBucket,
  toggleSelector,
  toolsetProblems as problemsOf,
  unsignedServerSelectors,
} from '../../lib/toolset';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import {
  AUTO_EXPAND_MAX,
  ToolsetResolutionList,
} from '../ToolsetResolutionList';
import { AccessLevelCards } from './AccessLevelCards';
import {
  EFFECT_FILTER_ID,
  effectDimension,
  effectFromPicks,
  type EffectFilter,
  filterCatalogueByEffect,
} from './catalogueEffect';
import { ConnectorGrid } from './ConnectorGrid';
import {
  ACCESS_CHAT_ONLY,
  ACCESS_OWN_PICKS,
  type AccessLevel,
  accessLevelOf,
  type ConnectorChoice,
  compactSelection,
  connectorsOf,
  expandSelection,
  inlineCapProblem,
  isPresetLevel,
  isSelectionOff,
  materialize,
  needsIndividualTools,
  presetBaseOf,
  withConnectorChoice,
} from './connectorChoice';
import { CopyFromAgent } from './CopyFromAgent';
import { SelectedRail, type SelectedRailProps } from './SelectedRail';
import { ToolCatalogue } from './ToolCatalogue';
import { ToolsetSummaryBar } from './ToolsetSummaryBar';

const useStyles = makeStyles(theme => ({
  sectionTitle: {
    marginBottom: theme.spacing(1),
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
  code: {
    fontFamily: 'monospace',
  },
}));

function SectionTitle({ title }: { title: string }) {
  const classes = useStyles();
  return (
    <Text
      as="h3"
      variant="title-x-small"
      weight="bold"
      className={classes.sectionTitle}
    >
      {title}
    </Text>
  );
}

/** The line under *Which apps?*: what the access level above means for it. */
function connectorsHint({
  level,
  derived,
  resolving,
  unsignedConnectors,
}: {
  level: AccessLevel;
  derived: boolean;
  resolving: boolean;
  unsignedConnectors: boolean;
}): string | undefined {
  if (level === ACCESS_CHAT_ONLY) {
    return 'Pick another option above to add tools.';
  }
  if (level === PRESET_FULL) {
    return 'Full gateway includes every tool.';
  }
  if (!isPresetLevel(level)) {
    return undefined;
  }
  if (resolving) {
    return 'Reading what the preset covers…';
  }
  if (!derived) {
    return 'This preset cannot be shown per connector here.';
  }
  // A change keeps the preset as the base while everything it covers stays
  // chosen (B1); taking part of it away writes it out, and what the author
  // cannot see does not make it into that list.
  return `Changing anything below switches to Only the tools I choose below${
    unsignedConnectors
      ? ', and removing something this preset covers also drops connectors you are not signed in to'
      : ''
  }.`;
}

/**
 * The summary bar where the frame has no room for the rail: below the
 * two-column tier, or in a frame too narrow for it beside the step.
 */
function NarrowSelection({
  onToggle,
  ...props
}: SelectedRailProps & { onToggle: (selector: string) => void }) {
  const { docked } = useWizardFrameRail();
  if (docked) {
    return null;
  }
  return (
    <ToolsetSummaryBar
      selectors={props.selectors}
      onRemove={onToggle}
      resolution={props.resolution}
      unsigned={props.unsigned}
      problems={props.problems}
      onShowDetails={props.onShowDetails ?? (() => {})}
    />
  );
}

/**
 * *What may it do?* (T81, T81b): the access level as a radio — *Nothing
 * outside the chat*, the presets, *Only the tools I choose below* — then
 * *Which apps?*, the connectors with *Read-only* / *All* each, then *Choose
 * individual tools instead*, which opens the catalogue and the power-user
 * paths (copy another agent's toolset, a selector by name, the resolved
 * list). The selection stays in view in the *Selected* rail. A preset is a
 * macro: the grid and the catalogue show what it covers, and a change there
 * switches to *Only the tools I choose below*, stored as the preset plus what
 * was added where selectors allow (B1), else written out. Nothing is
 * rewritten until the author picks something.
 */
export function NewAgentToolsPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const {
    details: newAgentLink,
    skills: skillsLink,
    review: reviewLink,
  } = useAgentWizardLinks();
  const {
    state,
    edit,
    setToolset,
    setToolsChatOnly,
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

  const isCatalogueLoading =
    Boolean(musterApi) && (catalogue.isLoading || isLoadingServers);
  const groups = useMemo(
    () =>
      buildCatalogue(catalogue.tools, servers, catalogue.serversRequiringAuth),
    [catalogue.tools, servers, catalogue.serversRequiringAuth],
  );
  const connectors = useMemo(() => connectorsOf(groups), [groups]);
  const inventory = useMemo(() => catalogueInventory(groups), [groups]);
  const unsigned = useMemo(
    () => unsignedServerSelectors(state.toolset, groups),
    [state.toolset, groups],
  );

  const offered = useMemo(
    () => new Set(presets.presets.map(preset => presetSelector(preset.name))),
    [presets.presets],
  );
  const level = accessLevelOf(
    state.toolset,
    Boolean(state.toolsChatOnly),
    offered,
  );
  const presetLevel = isPresetLevel(level);
  // The preset the toolset is built on, alone or with more beside it (B1).
  // Its own resolution is the toolset's while it stands alone (one query).
  const presetBase = presetBaseOf(state.toolset, offered);
  const presetResolution = useToolsetResolution(
    installation,
    presetBase ? [presetBase] : [],
  );
  const presetResolved =
    presetBase !== undefined &&
    !isCatalogueLoading &&
    presetResolution.status === 'resolved' &&
    !presetResolution.truncated;
  // While the toolset is built on a preset, the grid and the catalogue show
  // what it selects (T81b): the preset written out plus what is beside it —
  // once the resolution and the catalogue are in, and only when the
  // resolution is whole.
  const expanded = useMemo(
    () =>
      presetResolved
        ? expandSelection(
            materialize(presetResolution.tools, groups),
            state.toolset.filter(selector => selector !== presetBase),
            groups,
          )
        : undefined,
    [presetResolved, presetResolution.tools, groups, state.toolset, presetBase],
  );
  // The preset alone, written out.
  const derived = presetLevel ? expanded : undefined;
  // What every change below starts from: the selection as it shows, or as it
  // is when there is no preset to write out.
  const base = expanded ?? state.toolset;
  const selected = useMemo(() => new Set(base), [base]);
  // Every change is stored as compactly as selectors allow (B1): the preset
  // plus what was added while everything it covers is still chosen.
  const commit = useCallback(
    (next: string[]) =>
      setToolset(
        compactSelection(
          next,
          expanded && presetBase
            ? { preset: presetBase, resolved: presetResolution.tools }
            : undefined,
          groups,
        ),
      ),
    [setToolset, expanded, presetBase, presetResolution.tools, groups],
  );
  // Over the cap, the step can say which connectors to reduce.
  const problems = useMemo(
    () =>
      toolsetProblems.length === 0
        ? toolsetProblems
        : problemsOf(state.toolset, selectors =>
            inlineCapProblem(selectors, groups),
          ),
    [toolsetProblems, state.toolset, groups],
  );
  // Over the cap, muster refuses the toolset with its whole selector list
  // (QA R2-1); the cap problem already says what to reduce, so that refusal is
  // not shown beside it. Any other resolution error still is.
  const overCap =
    problems.length > 0 && state.toolset.length > MAX_INLINE_SELECTORS;
  // A preset that cannot be shown per connector cannot be changed from there
  // either: its selection stays off until the author picks Only the tools I
  // choose below.
  const selectionOff = isSelectionOff(level) || (presetLevel && !derived);

  // The individual tools: behind the link, or open from the start when the
  // selection holds what the level and the connectors cannot show (an edited
  // agent's toolset), decided once the catalogue has been read.
  const [showIndividual, setShowIndividual] = useState(false);
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || isCatalogueLoading || presets.isLoading) {
      return;
    }
    decided.current = true;
    // Beside a preset the step writes out, only what is added counts: the
    // grid shows the preset's part itself.
    const builtOn = presetBaseOf(state.toolset, offered);
    const shown =
      builtOn === undefined || state.toolset.length === 1
        ? state.toolset
        : state.toolset.filter(selector => selector !== builtOn);
    if (
      needsIndividualTools(
        shown,
        groups,
        shown === state.toolset ? level : ACCESS_OWN_PICKS,
      )
    ) {
      setShowIndividual(true);
    }
  }, [
    isCatalogueLoading,
    presets.isLoading,
    state.toolset,
    groups,
    level,
    offered,
  ]);
  const individualOpen = showIndividual && !selectionOff;

  // The catalogue's search and its All / Reads / Changes things filter, both
  // only over a catalogue too long to read whole (AUTO_EXPAND_MAX).
  const [query, setQuery] = useState('');
  const isShortCatalogue =
    !isCatalogueLoading &&
    inventory.servers +
      inventory.tools +
      inventory.platformAdministration +
      inventory.workflows <=
      AUTO_EXPAND_MAX;
  // Dropped when the catalogue shrinks under the bar (a re-read after a
  // sign-out), so neither is reapplied if it grows back.
  const activeQuery = isShortCatalogue ? '' : query.trim();
  const [effectPick, setEffect] = useState<EffectFilter>('all');
  const effect: EffectFilter = isShortCatalogue ? 'all' : effectPick;
  useEffect(() => {
    if (isShortCatalogue) {
      setQuery('');
      setEffect('all');
    }
  }, [isShortCatalogue]);
  const isNarrowed = activeQuery !== '' || effect !== 'all';

  const searchedGroups = useMemo(
    () => filterCatalogue(groups, activeQuery),
    [groups, activeQuery],
  );
  const visibleGroups = useMemo(
    () => filterCatalogueByEffect(searchedGroups, effect),
    [searchedGroups, effect],
  );
  const effectFilter = useMemo(
    () =>
      isShortCatalogue
        ? undefined
        : effectDimension(groups, searchedGroups, effect),
    [isShortCatalogue, groups, searchedGroups, effect],
  );
  const matches = useMemo(
    () => catalogueInventory(visibleGroups),
    [visibleGroups],
  );

  // A selector typed by hand: `server:x` on a portal without the muster
  // plugin, a tool known by name, or a second preset. Validated against the
  // grammar the chart and agent-manager enforce.
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
    if (!base.includes(value) && !state.toolset.includes(value)) {
      commit(toggleSelector(base, value));
    }
  }, [manualSelector, base, state.toolset, commit]);

  // A preset replaces the selection; *Only the tools I choose below* keeps
  // what a preset showed, written out (Full gateway's everything is not a
  // starting point: it starts empty).
  const pickLevel = useCallback(
    (next: AccessLevel) => {
      if (next === ACCESS_CHAT_ONLY) {
        setToolsChatOnly();
      } else if (next === ACCESS_OWN_PICKS) {
        setToolset(
          level !== PRESET_FULL && derived
            ? derived
            : state.toolset.filter(
                selector => presetNameOf(selector) === undefined,
              ),
        );
      } else {
        setToolset([next]);
      }
    },
    [setToolsChatOnly, setToolset, state.toolset, level, derived],
  );
  // Every change below starts from `base`, what the grid shows; unless it
  // lands back on the preset alone, the radio then reads Only the tools I
  // choose below.
  const chooseConnector = useCallback(
    (bucket: ServerBucket, choice: Exclude<ConnectorChoice, 'partial'>) =>
      commit(withConnectorChoice(base, bucket, choice)),
    [commit, base],
  );
  const toggleSelected = useCallback(
    (selector: string) => commit(toggleSelector(base, selector)),
    [commit, base],
  );
  // The rail and the bar list the toolset's own selectors (the preset among
  // them) beside the preset's part: removing one of its own takes just that
  // out — the preset with all it covers — and anything else is a change like
  // the grid's.
  const removeSelectors = useCallback(
    (selectors: string[]) =>
      selectors.every(entry => state.toolset.includes(entry))
        ? setToolset(state.toolset.filter(entry => !selectors.includes(entry)))
        : commit(base.filter(entry => !selectors.includes(entry))),
    [setToolset, commit, state.toolset, base],
  );

  // The rail stays in view; the full resolved list is in the individual tools.
  const resolvedListRef = useRef<HTMLElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  useEffect(() => {
    if (scrollRequest > 0) {
      resolvedListRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [scrollRequest]);
  const showResolvedList = useCallback(() => {
    setShowIndividual(true);
    setScrollRequest(count => count + 1);
  }, []);

  const backLink = hasRepositories ? skillsLink : newAgentLink;

  // The frame's footer carries Cancel and Back; only the primary lives here.
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        isDisabled={!isToolsetValid}
        onPress={() => reviewLink && navigate(reviewLink())}
      >
        Continue
      </Button>
    ),
    [reviewLink, navigate, isToolsetValid],
  );

  const onBack = useCallback(() => {
    navigate(backLink ? backLink() : '..');
  }, [backLink, navigate]);

  useProvidePageHeaderActions(isComplete ? actions : null);

  // A deep link with required step-1 fields missing can't be fixed here.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  const railProps: SelectedRailProps = {
    // An untouched preset is listed with what it covers.
    selectors:
      expanded && presetBase ? [presetBase, ...expanded] : state.toolset,
    catalogue: groups,
    resolution,
    unsigned,
    problems,
    onRemove: removeSelectors,
    onShowDetails: selectionOff ? undefined : showResolvedList,
  };

  const inventoryLine = !isNarrowed
    ? `${countNoun(inventory.servers, 'connector')} · ${countNoun(
        inventory.tools + inventory.platformAdministration,
        'tool',
      )} · ${countNoun(inventory.workflows, 'workflow')}`
    : `${countNoun(
        matches.tools + matches.platformAdministration,
        'tool',
      )} and ${countNoun(matches.workflows, 'workflow')} match`;
  const hint = connectorsHint({
    level,
    derived: Boolean(derived),
    resolving: presetLevel && resolution.status === 'loading',
    unsignedConnectors: connectors.some(bucket => bucket.needsSignIn),
  });

  return (
    <AgentWizardFrame
      step="tools"
      onBack={onBack}
      rail={<SelectedRail {...railProps} />}
    >
      <WizardStepHeading title="What may it do?">
        Connectors let the agent use other apps for you — never beyond what its
        user may reach.
      </WizardStepHeading>

      <Flex direction="column" gap="4">
        {/* An agent from before toolsets declares none and sees every tool;
            it keeps that until something is picked here. */}
        {edit && !edit.agent.toolset && state.toolset.length === 0 && (
          <Alert
            status="info"
            title="This agent declares no toolset"
            description="It can call every tool the gateway exposes until you pick something here."
          />
        )}

        <Flex direction="column" gap="2">
          {presets.isLoading ? (
            <LoadingIndicator label="Reading the environment's presets…" />
          ) : (
            presets.source === 'built-in' &&
            musterApi &&
            installation && (
              <Alert
                status="info"
                title="Only the built-in presets are known"
                description={
                  presets.error
                    ? `The environment's muster could not be asked (${presets.error}).`
                    : "This environment's muster lists no presets."
                }
              />
            )
          )}
          {/* The built-in list the hook holds while it reads stays valid
              whatever muster answers, so the options work from the start. */}
          <AccessLevelCards
            presets={presets.presets}
            level={level}
            onPick={pickLevel}
          />
        </Flex>

        <NarrowSelection
          {...railProps}
          onToggle={selector => removeSelectors([selector])}
        />

        <section aria-label="Which apps?">
          <SectionTitle title="Which apps?" />
          <Flex direction="column" gap="2">
            {hint && (
              <Text variant="body-small" color="secondary">
                {hint}
              </Text>
            )}
            {!musterApi && (
              <Text variant="body-small" color="secondary">
                Connectors cannot be listed in this portal.
              </Text>
            )}
            {musterApi && catalogue.error && (
              <Alert
                status="warning"
                title="Could not read the gateway's catalogue"
                description={catalogue.error}
              />
            )}
            {isCatalogueLoading && connectors.length === 0 && (
              <LoadingIndicator label="Reading the connectors…" />
            )}
            {connectors.length > 0 && (
              <ConnectorGrid
                connectors={connectors}
                selected={selected}
                disabled={selectionOff}
                onChoose={chooseConnector}
              />
            )}
            <div>
              <Button
                variant="tertiary"
                size="small"
                isDisabled={selectionOff}
                aria-expanded={individualOpen}
                onPress={() => setShowIndividual(value => !value)}
              >
                {individualOpen
                  ? 'Hide individual tools'
                  : 'Choose individual tools instead'}
              </Button>
            </div>
          </Flex>
        </section>

        {individualOpen && (
          <Card>
            <CardBody>
              <SectionTitle title="Individual tools" />
              <Flex direction="column" gap="3">
                {groups.length > 0 && (
                  <>
                    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                      {!isShortCatalogue && (
                        <Flex grow basis="240px" direction="column">
                          <SearchField
                            aria-label="Search tools"
                            placeholder="Search connectors, tools and workflows…"
                            value={query}
                            onChange={setQuery}
                          />
                        </Flex>
                      )}
                      {isNarrowed && (
                        <Button
                          variant="tertiary"
                          size="small"
                          onPress={() => {
                            setQuery('');
                            setEffect('all');
                          }}
                        >
                          Show everything again
                        </Button>
                      )}
                      <Text variant="body-small" color="secondary">
                        {inventoryLine}
                      </Text>
                    </Flex>
                    {effectFilter && (
                      <CatalogFilterBar
                        dimensions={[effectFilter]}
                        onSelect={(facetId, values) => {
                          if (facetId === EFFECT_FILTER_ID) {
                            setEffect(effectFromPicks(values));
                          }
                        }}
                      />
                    )}
                    {visibleGroups.length > 0 ? (
                      // Only the search opens every group it matched in: a
                      // Reads/Changes pick keeps most of the catalogue, and
                      // opening all of it would mount hundreds of rows.
                      <ToolCatalogue
                        groups={visibleGroups}
                        query={activeQuery}
                        installation={installation}
                        signInAvailable={Boolean(musterApi)}
                        selected={selected}
                        onToggle={toggleSelected}
                      />
                    ) : (
                      <Text color="secondary">
                        {activeQuery === ''
                          ? 'No tool of this kind.'
                          : `Nothing matches "${activeQuery}"${
                              effect === 'all' ? '' : ' with this filter'
                            }.`}
                      </Text>
                    )}
                  </>
                )}

                <details className={classes.details}>
                  <summary className={classes.summaryLine}>
                    Copy another agent's toolset
                  </summary>
                  <div className={classes.detailsBody}>
                    <CopyFromAgent
                      installation={installation}
                      current={state.toolset}
                      onCopy={setToolset}
                    />
                  </div>
                </details>

                <details className={classes.details}>
                  <summary className={classes.summaryLine}>
                    Add a selector by name
                  </summary>
                  <div className={classes.detailsBody}>
                    <Text variant="body-small" color="secondary">
                      Enter <span className={classes.code}>preset:</span>,{' '}
                      <span className={classes.code}>server:</span>,{' '}
                      <span className={classes.code}>workflow:</span> or{' '}
                      <span className={classes.code}>tool:</span> followed by
                      the exact name.
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

                <section ref={resolvedListRef} aria-label="Toolset">
                  <SectionTitle title="Toolset" />
                  <Flex direction="column" gap="3">
                    {problems.length > 0 && (
                      <Alert
                        status="danger"
                        title={
                          overCap
                            ? 'Too many selectors'
                            : 'The toolset cannot be applied as it is'
                        }
                        description={problems.join(' ')}
                      />
                    )}
                    {unsigned.length > 0 && (
                      <Alert
                        status="info"
                        title="Selected without a sign-in"
                        description={`${unsigned.join(
                          ', ',
                        )}: the list below is incomplete until you sign in to them.`}
                      />
                    )}
                    {!(overCap && resolution.status === 'error') && (
                      <ToolsetResolutionList
                        resolution={resolution}
                        servers={servers}
                      />
                    )}
                  </Flex>
                </section>
              </Flex>
            </CardBody>
          </Card>
        )}

        {/* The rail says why too; this sits by Continue, where it is blocked. */}
        {!isToolsetValid && (
          <Text as="p" color="danger">
            Fix the toolset to continue.
          </Text>
        )}
      </Flex>
    </AgentWizardFrame>
  );
}
