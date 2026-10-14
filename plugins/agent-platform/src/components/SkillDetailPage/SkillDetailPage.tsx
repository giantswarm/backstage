import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  type Fact,
  FactList,
  LoadingIndicator,
  MoreActionsMenu,
  type MoreActionsMenuItem,
  PageSection,
  type RouteTabSpec,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageTitleSkeleton,
  useFactTextVariant,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { useMetaAgentHandoff } from '../../hooks/useMetaAgentHandoff';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useSkillContent } from '../../hooks/useSkillContent';
import { skillSource } from '../../lib/customize';
import {
  canonicalRepoUrl,
  canonicalSkillId,
  canProposeSkillTo,
  isSkillContentReadable,
  resolveSkillDetailPath,
  sameCommit,
  shortCommit,
  skillDetailPath,
  skillSourceUrl,
  type DiscoveredSkill,
  type SkillDetailTab,
} from '../../lib/skills';
import { skillsRouteRef } from '../../routes';
import { AgentRow, useAgents } from '../AgentsDataProvider';
import { AgentUsageList } from '../AgentUsageList';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { SkillFiles } from '../SkillFiles';
import { SkillInstructions } from '../SkillInstructions';
import { evaluationPrompt } from './evaluationPrompt';
import {
  SkillUpdateAgentsDialog,
  type BehindAgent,
} from './SkillUpdateAgentsDialog';

/** The agents whose mounted skills include this one, by canonical id. */
export function agentsUsingSkill(
  rows: AgentRow[],
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
): AgentRow[] {
  const id = canonicalSkillId(skill);
  return rows
    .filter(row => (row.skillIds ?? []).includes(id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The agents among `using` that pin the skill at a commit other than the
 * catalog's head (`skill.commit`, the head of its branch when the catalog was
 * read), with the commit each pins. An agent whose pin is unknown is left out:
 * there is nothing to compare.
 */
export function agentsBehindSkill(
  using: AgentRow[],
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit'>,
): BehindAgent[] {
  if (!skill.commit) {
    return [];
  }
  const id = canonicalSkillId(skill);
  return using.flatMap(row => {
    const pinned = row.skillPins?.[id];
    return pinned && !sameCommit(pinned, skill.commit) ? [{ row, pinned }] : [];
  });
}

const useStyles = makeStyles({
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-6)',
  },
});

/** A fact's link out to GitHub, at the size of the fact list it is in. */
function FactLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={useFactTextVariant()}
    >
      {children}
    </Link>
  );
}

/**
 * What the skill is for, in its own words, then where it lives, and why the
 * page offers less than usual when it does: a repository the portal cannot
 * propose changes to, or a SKILL.md it could not read.
 */
function OverviewTab({
  skill,
  facts,
  readable,
  proposable,
}: {
  skill: DiscoveredSkill;
  facts: Fact[];
  readable: boolean;
  proposable: boolean;
}) {
  const classes = useStyles();
  return (
    <div className={classes.sections}>
      {!proposable && (
        <Alert
          status="info"
          title="Read-only in the portal"
          description="This skill's repository is not on github.com, and the portal proposes changes as GitHub pull requests. Change or evaluate the skill in its repository."
        />
      )}
      {!readable && (
        <Alert
          status="info"
          title="The portal cannot read this skill's source"
          description="Its SKILL.md could not be read, so this page shows only what the listing knows and the skill cannot be edited here."
        />
      )}
      <PageSection title="What it’s for">
        {skill.description ? (
          <Text as="p" variant="body-medium" style={{ margin: 0 }}>
            {skill.description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            Its SKILL.md gives no description.
          </Text>
        )}
      </PageSection>
      <PageSection title="Where it lives">
        <FactList facts={facts} labelWidth={160} />
      </PageSection>
    </div>
  );
}

/**
 * The header's "· N more files" for a skill whose directory holds more than
 * its SKILL.md (`fileCount` from the listing); nothing for a single file or
 * an older backend.
 */
export function moreFilesCaption(fileCount: number | undefined): string {
  const more = (fileCount ?? 0) - 1;
  if (more <= 0) {
    return '';
  }
  return ` · ${more} more ${more === 1 ? 'file' : 'files'}`;
}

/**
 * The SKILL.md body, read at the pinned commit through
 * `GET /agent-skills/content` — the same read Edit is prefilled from, cached
 * by commit, so opening Edit from here reads nothing twice. Only for a
 * readable skill; the tab is not offered otherwise.
 *
 * A skill with more files than its SKILL.md (the read lists them) shows them
 * here too, as a tree beside a viewer (`SkillFiles`); a single-file skill, or
 * one whose files could not be listed, is just its instructions.
 */
function InstructionsTab({ skill }: { skill: DiscoveredSkill }) {
  const { content, isLoading, error } = useSkillContent(skill);
  const file = skill.path ? `${skill.path}/SKILL.md` : 'SKILL.md';

  if (isLoading) {
    return <LoadingIndicator label="Reading the instructions…" />;
  }
  if (error || !content) {
    return (
      <Alert
        status="danger"
        title="Could not read the instructions"
        description={
          error?.message ?? 'The SKILL.md could not be read right now.'
        }
      />
    );
  }
  if (content.files && content.files.length > 1) {
    return (
      <SkillFiles
        skill={skill}
        commit={content.commit}
        instructions={content.instructions}
        files={content.files}
        filesTruncated={content.filesTruncated}
      />
    );
  }
  return (
    <Flex direction="column" gap="3">
      <Text as="p" variant="body-small" color="secondary">
        {file} at {shortCommit(content.commit)}
      </Text>
      {content.instructions.trim() ? (
        <SkillInstructions
          markdown={content.instructions}
          sourceUrl={skillSourceUrl(skill)}
        />
      ) : (
        <Text as="p" variant="body-medium" color="secondary">
          The SKILL.md has no instructions under its frontmatter.
        </Text>
      )}
    </Flex>
  );
}

/**
 * The agents using the skill, as the connector page's Used by tab lists its
 * agents (`AgentUsageList`): each linking to its own page, with where it runs
 * at the row's end. Each pins the skill to a commit; a row pinned at an older
 * one than the catalog's head says so, and the line under the list says
 * whether any are behind — the header's "Update agents" moves them, so no
 * update control repeats here.
 */
function UsedByTab({
  using,
  behind,
  head,
  isLoading,
  unreachableInstallations,
}: {
  using: AgentRow[];
  behind: BehindAgent[];
  head: string;
  isLoading: boolean;
  unreachableInstallations: string[];
}) {
  const agents = useMemo(() => {
    const pinnedBehind = new Map(
      behind.map(({ row, pinned }) => [row.id, pinned]),
    );
    // The rows span every installation and namespace: where two agents share
    // a name on one installation, their namespaces tell them apart.
    const nameKey = (row: AgentRow) => `${row.installation}\u0000${row.name}`;
    const named = new Map<string, number>();
    for (const row of using) {
      named.set(nameKey(row), (named.get(nameKey(row)) ?? 0) + 1);
    }
    return using.map(row => {
      const pinned = pinnedBehind.get(row.id);
      return {
        row,
        detail: [
          row.installation,
          ...(named.get(nameKey(row))! > 1 ? [row.namespace] : []),
          ...(pinned ? [`older version (${shortCommit(pinned)})`] : []),
        ].join(' · '),
      };
    });
  }, [using, behind]);

  return (
    <Flex direction="column" gap="3">
      {unreachableInstallations.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {unreachableInstallations.length === 1
            ? `The agents on ${unreachableInstallations[0]} could not be read, so some users of this skill may be missing.`
            : `The agents on ${unreachableInstallations.length} environments could not be read, so some users of this skill may be missing.`}
        </Text>
      )}
      <AgentUsageList
        agents={agents}
        label="Agents using this skill"
        emptyText="No agent uses this skill yet. Add it to an agent when creating or editing one."
        isLoading={isLoading}
      >
        {agents.length > 0 && (
          <Text as="p" variant="body-small" color="secondary">
            {behind.length === 0 &&
              `All agents use the newest version (${shortCommit(head)}).`}
            {behind.length === 1 &&
              `One agent pins an older commit than the newest (${shortCommit(
                head,
              )}). Update agents moves it there.`}
            {behind.length > 1 &&
              `${behind.length} agents pin an older commit than the newest (${shortCommit(
                head,
              )}). Update agents moves them there.`}
          </Text>
        )}
      </AgentUsageList>
    </Flex>
  );
}

/** One header action: a press, as a button or a menu item. */
type SkillAction = Pick<MoreActionsMenuItem, 'id' | 'label' | 'isDisabled'> & {
  onAction: () => void;
};

/**
 * The header's actions at phone width: the primary one as a button (else the
 * first), the others in a ⋯ menu — four buttons wrapped to two rows at
 * 343px. The Model hosting header's idiom (`ModelHostingActions`).
 */
function PhoneSkillActions({
  primary,
  others,
}: {
  primary?: SkillAction;
  others: SkillAction[];
}) {
  const [button, ...rest] = primary ? [primary, ...others] : others;
  if (!button) {
    return null;
  }
  return (
    <Flex align="center" gap="2">
      <Button
        variant={button === primary ? 'primary' : 'secondary'}
        isDisabled={button.isDisabled}
        onPress={button.onAction}
      >
        {button.label}
      </Button>
      <MoreActionsMenu items={rest} />
    </Flex>
  );
}

function SkillPage({
  skill,
  tab,
  basePath,
}: {
  skill: DiscoveredSkill;
  tab: SkillDetailTab;
  /** The skill's own URL, without a tab segment: the tabs' base. */
  basePath: string;
}) {
  const navigate = useNavigate();
  const isPhone = usePhoneLayout();
  const skillsRoute = useRouteRef(skillsRouteRef);
  const {
    rows,
    isLoading: agentsLoading,
    unreachableInstallations,
  } = useAgents();
  const using = useMemo(() => agentsUsingSkill(rows, skill), [rows, skill]);
  const behind = useMemo(() => agentsBehindSkill(using, skill), [using, skill]);

  // The agents behind as they stood when "Update agents" was pressed: the
  // list re-reads as updates land, and the dialog must keep showing each
  // agent's outcome rather than lose the row the moment it is no longer behind.
  const [updateTargets, setUpdateTargets] = useState<BehindAgent[]>();
  const openUpdateAgents = useCallback(() => {
    setUpdateTargets(behind);
  }, [behind]);

  // Edit and Evaluate both end in a pull request (the portal's own, or the
  // evaluator's), and pull requests are github.com only — the skill-PR
  // endpoint refuses any other repository. A skill elsewhere is read-only
  // here, and the Overview says why.
  const proposable = canProposeSkillTo(skill.repoUrl);

  // "Evaluate with …" exists only where the Skill Evaluator role is
  // configured and resolves to an agent that can take a session (decisions
  // G8/G13); unresolved, no button. It is a session, not a form: one press
  // creates it with the evaluator and the prompt naming this skill, then
  // opens it (`useMetaAgentHandoff`, a "<verb> with X" hand-off).
  const {
    agent: evaluator,
    start: startEvaluation,
    isCreating,
    error: evaluateError,
  } = useMetaAgentHandoff('skillEvaluation', 'skillDetail');
  const onEvaluate = useCallback(() => {
    startEvaluation(evaluationPrompt(skill)).catch(() => {});
  }, [startEvaluation, skill]);

  // Editing is the add-skill flow, prefilled from the SKILL.md; it opens a
  // pull request. Only for a skill whose file the portal could read — an edit
  // of one it cannot read would end in an error. Evaluate stays: the
  // evaluator reads the repository with its own access.
  const readable = isSkillContentReadable(skill);
  const detailPath = skillDetailPath(skill);
  const editHref =
    proposable && readable && skillsRoute && detailPath
      ? `${skillsRoute()}/edit/${detailPath}`
      : undefined;
  const openEdit = useCallback(() => {
    if (editHref) {
      navigate(editHref);
    }
  }, [editHref, navigate]);

  const source = skillSource(skill);
  // The skill's folder at the catalog's head (github.com only).
  const sourceUrl = skillSourceUrl(skill);

  const facts: Fact[] = [
    {
      label: 'Source',
      value: (
        <FactLink href={canonicalRepoUrl(skill.repoUrl)}>{source}</FactLink>
      ),
    },
    {
      label: 'Path',
      value: skill.path ? `${skill.path}/SKILL.md` : 'SKILL.md',
    },
    { label: 'Branch', value: skill.ref },
    {
      // The catalog's head, not a pin: "pinned" is each agent's own commit
      // (UX review M19). It opens the skill's folder at that commit.
      label: 'Latest commit',
      value: sourceUrl ? (
        <FactLink href={sourceUrl}>{shortCommit(skill.commit)}</FactLink>
      ) : (
        shortCommit(skill.commit)
      ),
    },
  ];

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
    { label: 'Skills', href: `${SHELL_CUSTOMIZE_PATH}/skills` },
    { label: skill.name },
  ];

  // Agent detail's tab strip, for a skill: what it is, what it says (only
  // when the portal can read it), and who uses it.
  const tabs: RouteTabSpec[] = [
    { id: 'overview', path: '', title: 'Overview' },
    ...(readable
      ? [{ id: 'instructions', path: 'instructions', title: 'Instructions' }]
      : []),
    {
      id: 'used-by',
      path: 'used-by',
      title: 'Used by',
      count: agentsLoading ? undefined : using.length,
    },
  ];

  if (tab === 'instructions' && !readable) {
    return <Navigate to={basePath} replace />;
  }

  // The Agent detail header's actions, in its order and formatting: the
  // secondary actions first, the primary last, all at the header's right.
  // "Update agents" only while some agent pins an older commit; with none
  // behind, the Used by tab says so in a line instead.
  const canEvaluate = Boolean(evaluator) && proposable;
  const evaluateLabel = `Evaluate with ${evaluator?.name}`;
  const canUpdateAgents = !agentsLoading && behind.length > 0;
  let actions: ReactNode;
  if (isPhone) {
    const others: SkillAction[] = [
      ...(canUpdateAgents
        ? [
            {
              id: 'update-agents',
              label: 'Update agents',
              onAction: openUpdateAgents,
            },
          ]
        : []),
      ...(editHref ? [{ id: 'edit', label: 'Edit', onAction: openEdit }] : []),
    ];
    actions = (
      <PhoneSkillActions
        primary={
          canEvaluate
            ? {
                id: 'evaluate',
                label: isCreating ? 'Starting…' : evaluateLabel,
                onAction: onEvaluate,
                isDisabled: isCreating,
              }
            : undefined
        }
        others={others}
      />
    );
  } else if (canUpdateAgents || editHref || canEvaluate) {
    actions = (
      <>
        {canUpdateAgents && (
          <Button variant="secondary" onPress={openUpdateAgents}>
            Update agents
          </Button>
        )}
        {editHref && (
          <Button variant="secondary" onPress={openEdit}>
            Edit
          </Button>
        )}
        {canEvaluate && (
          <Button
            variant="primary"
            onPress={onEvaluate}
            isDisabled={isCreating}
          >
            {isCreating ? 'Starting…' : evaluateLabel}
          </Button>
        )}
      </>
    );
  }

  let content;
  if (tab === 'instructions') {
    content = <InstructionsTab skill={skill} />;
  } else if (tab === 'used-by') {
    content = (
      <UsedByTab
        using={using}
        behind={behind}
        head={skill.commit}
        isLoading={agentsLoading}
        unreachableInstallations={unreachableInstallations}
      />
    );
  } else {
    content = (
      <OverviewTab
        skill={skill}
        facts={facts}
        readable={readable}
        proposable={proposable}
      />
    );
  }

  return (
    <>
      <ShellPage
        title={skill.name}
        breadcrumbs={breadcrumbs}
        meta={`Read from ${source} at ${shortCommit(
          skill.commit,
        )}${moreFilesCaption(skill.fileCount)}`}
        actions={actions}
        tabs={tabs}
        tabsBasePath={basePath}
      >
        <Flex direction="column" gap="4">
          {evaluateError && (
            <Alert
              status="danger"
              title="Could not start the evaluation"
              description={evaluateError.message}
            />
          )}
          {content}
        </Flex>
        {updateTargets && (
          <SkillUpdateAgentsDialog
            skillName={skill.name}
            head={skill.commit}
            behind={updateTargets}
            isOpen
            onOpenChange={isOpen => {
              if (!isOpen) {
                setUpdateTargets(undefined);
              }
            }}
          />
        )}
      </ShellPage>
    </>
  );
}

/**
 * One discovered skill, as Agent detail presents an agent: the name and the
 * repository/commit it was read at in the `ShellPage` header, its actions at
 * the header's right, and three routed tabs —
 *
 * - **Overview** (the index): what it is for (frontmatter `description`),
 *   then where it lives and the catalog's head commit as facts under it;
 * - **Instructions** (`…/instructions`): the SKILL.md body as a document
 *   (`SkillInstructions`: GFM, no raw HTML, no remote loads) — only for a
 *   skill whose SKILL.md the portal could read (`contentReadable`); otherwise
 *   the Overview says the portal cannot read its source. A skill with more
 *   files shows them there as a tree beside a viewer (`SkillFiles`), and the
 *   header says "· N more files";
 * - **Used by** (`…/used-by`): the agents mounting it, windowed, as the
 *   connector page lists its agents.
 *
 * Actions: "Update agents" appears only while some agent using the skill pins
 * an older commit than the catalog's head, and opens `SkillUpdateAgentsDialog`
 * — Agent detail's "Update skills" (`refreshSkills`) run per selected agent,
 * as a pull request for one applied from git; with none behind, the Used by
 * tab says "All agents use the newest version" instead. "Edit" opens the
 * add-skill flow prefilled (`EditSkillPage`), which
 * proposes the change as a pull request — only for a readable skill in a
 * github.com repository; "Evaluate with …" appears only where `metaAgents.skillEvaluation`
 * resolves and starts a session with that agent straight away — the prompt
 * names the skill and asks for a report and an improvement pull request.
 *
 * Addressed as `<owner>/<repo>[/<skill dir>]` (github.com) or
 * `-/<host>/<repo path>[/-/<skill dir>]` (any other git repository, shown
 * read-only) under `/agent-platform/skills`, a tab as one more segment; the
 * skill itself is found in the discovered catalog, so an unknown address is a
 * not-found state, and an unreadable catalog says so instead.
 */
export function SkillDetailPage() {
  const splat = useParams()['*'] ?? '';
  const { pathname } = useLocation();
  const catalog = useSkillCatalog();

  const resolved = useMemo(
    () => resolveSkillDetailPath(splat, catalog.skills),
    [splat, catalog.skills],
  );

  if (!resolved) {
    // Not even `owner/repo`: nothing to look up, back to the list.
    return <Navigate to={`${SHELL_CUSTOMIZE_PATH}/skills`} replace />;
  }

  if (resolved.skill) {
    const own = pathname.replace(/\/+$/, '');
    const basePath =
      resolved.tab === 'overview' ? own : own.slice(0, own.lastIndexOf('/'));
    return (
      <SkillPage
        skill={resolved.skill}
        tab={resolved.tab}
        basePath={basePath}
      />
    );
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
    { label: 'Skills', href: `${SHELL_CUSTOMIZE_PATH}/skills` },
    { label: 'Skill' },
  ];

  if (catalog.isLoading) {
    // The loaded page's frame from the first paint — its trail, title line,
    // meta row and tab strip — with
    // skeletons where the catalog will fill in (T95). Only the tabs every
    // skill has are drawn; Instructions joins them once the skill is known
    // to be readable.
    const own = pathname.replace(/\/+$/, '');
    const tab = own.match(/\/(instructions|used-by)$/)?.[1];
    return (
      <ShellPage
        title={<ShellPageTitleSkeleton label="Loading skill" />}
        breadcrumbs={breadcrumbs}
        badges={<ShellPageBadgeSkeleton />}
        tabs={[
          { id: 'overview', path: '', title: 'Overview' },
          { id: 'used-by', path: 'used-by', title: 'Used by' },
        ]}
        tabsBasePath={tab ? own.slice(0, own.lastIndexOf('/')) : own}
      >
        <LoadingIndicator label="Reading the skill repositories…" />
      </ShellPage>
    );
  }

  // As the agent and model pages: a failed read is an error, a skill that is
  // not there an empty state, each with the way back.
  const backToSkills = (
    <Link href={`${SHELL_CUSTOMIZE_PATH}/skills`}>Back to skills</Link>
  );
  let body;
  if (catalog.error || catalog.failedRepositories.length > 0) {
    body = (
      <Flex direction="column" gap="3" align="start">
        <Alert
          status="danger"
          title="Could not read the skill repositories"
          description="The skill may exist, but its repository could not be read right now. Try again in a moment."
        />
        {backToSkills}
      </Flex>
    );
  } else {
    body = (
      <EmptyStateCard
        title="Skill not found"
        description="No skill with this address exists in the configured repositories. It may have been renamed or removed."
        actions={backToSkills}
      />
    );
  }

  return (
    <ShellPage title="Skill" breadcrumbs={breadcrumbs}>
      {body}
    </ShellPage>
  );
}
