import { useCallback, useMemo, type ReactNode } from 'react';
import { Helmet } from 'react-helmet';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  ButtonLink,
  Flex,
  Link,
  List,
  ListRow,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  EmptyStateCard,
  FactsColumn,
  LoadingIndicator,
  SectionHeader,
  ShellPage,
  type BreadcrumbItem,
  type Fact,
  type RouteTabSpec,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useCreateSession } from '../../hooks/useCreateSession';
import { useMetaAgent } from '../../hooks/useMetaAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useSkillContent } from '../../hooks/useSkillContent';
import { skillSource, usedByLabel } from '../../lib/customize';
import {
  canonicalRepoUrl,
  canonicalSkillId,
  canProposeSkillTo,
  isSkillContentReadable,
  resolveSkillDetailPath,
  shortCommit,
  skillCommitUrl,
  skillDetailPath,
  skillSourceUrl,
  type DiscoveredSkill,
  type SkillDetailTab,
} from '../../lib/skills';
import {
  agentDetailRouteRef,
  sessionDetailRouteRef,
  skillsRouteRef,
} from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { AgentRow, useAgents } from '../AgentsDataProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { ShowMore, USED_BY_ROWS } from '../ShowMore';
import { SkillInstructions } from '../SkillInstructions';
import { evaluationPrompt } from './evaluationPrompt';

const AVATAR_SIZE = 96;

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

const useStyles = makeStyles({
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-6)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-3)',
    // SectionHeader carries a bottom margin meant for a description under
    // it; these sections put their own content there.
    '& h2': { marginBottom: 0 },
  },
});

/** A section of a tab: a small heading, then what it says. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const classes = useStyles();
  return (
    <section className={classes.section} aria-label={title}>
      <SectionHeader as="h2" variant="title-x-small" title={title} />
      {children}
    </section>
  );
}

/**
 * What the skill is for, in its own words, and why the page offers less than
 * usual when it does: a repository the portal cannot propose changes to, or a
 * SKILL.md it could not read. The facts sit beside it (`aside`).
 */
function OverviewTab({
  skill,
  readable,
  proposable,
}: {
  skill: DiscoveredSkill;
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
          description="This skill's repository is not on github.com. The portal proposes skill changes as GitHub pull requests, so it cannot edit or evaluate this skill here — change it in its repository."
        />
      )}
      {!readable && (
        <Alert
          status="info"
          title="The portal cannot read this skill's source"
          description="Its SKILL.md could not be read with the portal's access to the repository, so this page shows only what the listing knows, and the skill cannot be edited here."
        />
      )}
      <Section title="What it’s for">
        {skill.description ? (
          <Text as="p" variant="body-medium" style={{ margin: 0 }}>
            {skill.description}
          </Text>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            Its SKILL.md gives no description.
          </Text>
        )}
      </Section>
    </div>
  );
}

/**
 * The SKILL.md body, read at the pinned commit through
 * `GET /agent-skills/content` — the same read Edit is prefilled from, cached
 * by commit, so opening Edit from here reads nothing twice. Only for a
 * readable skill; the tab is not offered otherwise.
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
 * The agents using the skill, each linking to its own page — which is also
 * where a pinned commit is updated (`Update skills` there re-reads the head),
 * so this list is the page's honest "update" affordance: there is no global
 * update, a pin lives on each agent. Windowed (`ShowMore`), since a popular
 * skill can be mounted by hundreds of agents.
 */
function UsedByTab({
  using,
  isLoading,
  unreachableInstallations,
}: {
  using: AgentRow[];
  isLoading: boolean;
  unreachableInstallations: string[];
}) {
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading the agents…" />;
  } else if (using.length === 0) {
    body = (
      <Text as="p" variant="body-medium" color="secondary">
        No agent uses this skill yet. Add it to an agent when creating or
        editing one.
      </Text>
    );
  } else {
    body = (
      <Flex direction="column" gap="2">
        <ShowMore items={using} initial={USED_BY_ROWS} noun="agent" revealAll>
          {shown => (
            <List aria-label="Agents using this skill">
              {shown.map(row => (
                <ListRow
                  key={row.id}
                  id={row.id}
                  href={agentDetailRoute?.({
                    installation: row.installation,
                    namespace: row.namespace,
                    name: row.technicalName,
                  })}
                  icon={
                    <AgentAvatar
                      size="small"
                      purpose="decoration"
                      name={row.name}
                      src={
                        buildAvatarUrl(row.installation, row.technicalName, {
                          size: AVATAR_SIZE,
                        }) ?? ''
                      }
                    />
                  }
                  customActions={
                    <Text variant="body-small" color="secondary">
                      {row.installation} · {row.namespace}
                    </Text>
                  }
                >
                  {row.name}
                </ListRow>
              ))}
            </List>
          )}
        </ShowMore>
        <Text as="p" variant="body-small" color="secondary">
          Each agent pins the skill to a commit. To move an agent to the latest
          version, update its skills on the agent's page.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <SectionHeader title={usedByLabel(using.length)} />
      {unreachableInstallations.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {unreachableInstallations.length === 1
            ? `The agents on ${unreachableInstallations[0]} could not be read, so some users of this skill may be missing.`
            : `The agents on ${unreachableInstallations.length} environments could not be read, so some users of this skill may be missing.`}
        </Text>
      )}
      {body}
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
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const skillsRoute = useRouteRef(skillsRouteRef);
  const {
    rows,
    isLoading: agentsLoading,
    unreachableInstallations,
  } = useAgents();
  const using = useMemo(() => agentsUsingSkill(rows, skill), [rows, skill]);

  // Edit and Evaluate both end in a pull request (the portal's own, or the
  // evaluator's), and pull requests are github.com only — the skill-PR
  // endpoint refuses any other repository. A skill elsewhere is read-only
  // here, and the Overview says why.
  const proposable = canProposeSkillTo(skill.repoUrl);

  // "Evaluate" exists only where the Skill Evaluator role is configured and
  // resolves to a live agent (decisions G8/G13); unresolved, no button.
  const evaluator = useMetaAgent('skillEvaluation');
  const {
    createSession,
    isCreating,
    error: evaluateError,
  } = useCreateSession('skillDetail');

  // Evaluate is a session, not a form: one press creates it with the
  // evaluator and the prompt naming this skill, then hands over to the
  // session page like every other entry point.
  const onEvaluate = useCallback(async () => {
    if (!evaluator) {
      return;
    }
    const prompt = evaluationPrompt(skill);
    let sessionId: string;
    try {
      sessionId = await createSession({ agent: evaluator, prompt });
    } catch {
      // Shown from the hook's error, above the page's content.
      return;
    }
    const href = sessionDetailRoute?.({
      installation: evaluator.installation,
      sessionId,
    });
    if (!href) {
      return;
    }
    // The prompt travels with the navigation and is sent by the session
    // detail page — see "Starting a session" in docs/agent-platform.md.
    navigate(href, {
      state: {
        [NEW_SESSION_STATE_KEY]: {
          text: prompt,
          agentNamespace: evaluator.namespace,
          agentName: evaluator.technicalName,
        },
      },
    });
  }, [createSession, evaluator, navigate, sessionDetailRoute, skill]);

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
  const sourceUrl = skillSourceUrl(skill);
  const commitUrl = skillCommitUrl(skill);

  const facts: Fact[] = [
    {
      label: 'Source',
      value: (
        <Link
          href={canonicalRepoUrl(skill.repoUrl)}
          target="_blank"
          rel="noopener noreferrer"
          variant="body-small"
        >
          {source}
        </Link>
      ),
    },
    {
      label: 'Path',
      value: skill.path ? `${skill.path}/SKILL.md` : 'SKILL.md',
    },
    { label: 'Branch', value: skill.ref },
    {
      label: 'Pinned commit',
      value: commitUrl ? (
        <Link
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="body-small"
        >
          {shortCommit(skill.commit)}
        </Link>
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
  const canEvaluate = Boolean(evaluator) && proposable;
  const actions =
    editHref || sourceUrl || canEvaluate ? (
      <>
        {editHref && (
          <Button variant="secondary" onPress={openEdit}>
            Edit
          </Button>
        )}
        {sourceUrl && (
          <ButtonLink
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            View source ↗
          </ButtonLink>
        )}
        {canEvaluate && (
          <Button
            variant="primary"
            onPress={onEvaluate}
            isDisabled={isCreating}
          >
            {isCreating ? 'Starting…' : 'Evaluate'}
          </Button>
        )}
      </>
    ) : undefined;

  let content;
  if (tab === 'instructions') {
    content = <InstructionsTab skill={skill} />;
  } else if (tab === 'used-by') {
    content = (
      <UsedByTab
        using={using}
        isLoading={agentsLoading}
        unreachableInstallations={unreachableInstallations}
      />
    );
  } else {
    content = (
      <OverviewTab skill={skill} readable={readable} proposable={proposable} />
    );
  }

  return (
    <>
      <Helmet title={`${skill.name} · Skills`} />
      <ShellPage
        title={skill.name}
        breadcrumbs={breadcrumbs}
        meta={`Read from ${source} at ${shortCommit(skill.commit)}`}
        actions={actions}
        tabs={tabs}
        tabsBasePath={basePath}
        // The facts belong to the Overview; the instructions and the agents
        // take the whole width.
        aside={
          tab === 'overview' ? (
            <FactsColumn aria-label="About this skill" facts={facts} />
          ) : undefined
        }
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
 *   with where it lives and the pinned commit as facts beside it;
 * - **Instructions** (`…/instructions`): the SKILL.md body as a document
 *   (`SkillInstructions`: GFM, no raw HTML, no remote loads) — only for a
 *   skill whose SKILL.md the portal could read (`contentReadable`); otherwise
 *   the Overview says the portal cannot read its source;
 * - **Used by** (`…/used-by`): the agents mounting it, windowed.
 *
 * Actions: "Edit" opens the add-skill flow prefilled (`EditSkillPage`), which
 * proposes the change as a pull request — only for a readable skill in a
 * github.com repository; "View source" opens the folder at the pinned commit
 * (github.com only); "Evaluate" appears only where `metaAgents.skillEvaluation`
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

  let body;
  if (catalog.isLoading) {
    body = <LoadingIndicator label="Reading the skill repositories…" />;
  } else if (catalog.error || catalog.failedRepositories.length > 0) {
    body = (
      <Alert
        status="warning"
        title="Could not read the skill repositories"
        description="The skill may exist, but its repository could not be read right now. Try again in a moment."
      />
    );
  } else {
    body = (
      <EmptyStateCard
        title="Skill not found"
        description="No skill at this address was discovered in the configured repositories. It may have been renamed or removed — the list has what exists now."
      />
    );
  }

  return (
    <ShellPage title="Skill" breadcrumbs={breadcrumbs}>
      {body}
    </ShellPage>
  );
}
