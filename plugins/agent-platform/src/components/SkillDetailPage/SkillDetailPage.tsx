import { useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
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
import {
  EmptyStateCard,
  FactsColumn,
  LoadingIndicator,
  SectionHeader,
  ShellPage,
  type BreadcrumbItem,
  type Fact,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useCreateSession } from '../../hooks/useCreateSession';
import { useMetaAgent } from '../../hooks/useMetaAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { skillSource, usedByLabel } from '../../lib/customize';
import {
  canonicalRepoUrl,
  canonicalSkillId,
  isSkillContentReadable,
  parseSkillDetailPath,
  shortCommit,
  skillCommitUrl,
  skillDetailPath,
  skillSourceUrl,
  type DiscoveredSkill,
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

/**
 * The agents using the skill, each linking to its own page — which is also
 * where a pinned commit is updated (`Update skills` there re-reads the head),
 * so this list is the page's honest "update" affordance: there is no global
 * update, a pin lives on each agent.
 */
function UsedBySection({ skill }: { skill: DiscoveredSkill }) {
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const using = useMemo(() => agentsUsingSkill(rows, skill), [rows, skill]);

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

function SkillPage({ skill }: { skill: DiscoveredSkill }) {
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const skillsRoute = useRouteRef(skillsRouteRef);

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
    readable && skillsRoute && detailPath
      ? `${skillsRoute()}/edit/${detailPath}`
      : undefined;

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

  return (
    <>
      <Helmet title={`${skill.name} · Skills`} />
      <ShellPage
        title={skill.name}
        breadcrumbs={breadcrumbs}
        description={skill.description || undefined}
        meta={`Read from ${source} at ${shortCommit(skill.commit)}`}
        actions={
          <>
            {editHref && (
              <ButtonLink href={editHref} variant="secondary">
                Edit
              </ButtonLink>
            )}
            {evaluator && (
              <Button
                variant="secondary"
                onPress={onEvaluate}
                isDisabled={isCreating}
              >
                {isCreating ? 'Starting…' : 'Evaluate'}
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
          </>
        }
        aside={<FactsColumn facts={facts} />}
      >
        {!readable && (
          <Alert
            status="info"
            title="The portal cannot read this skill's source"
            description="Its SKILL.md could not be read with the portal's access to the repository, so this page shows only what the listing knows, and the skill cannot be edited here."
          />
        )}
        {evaluateError && (
          <Alert
            status="danger"
            title="Could not start the evaluation"
            description={evaluateError.message}
          />
        )}
        <UsedBySection skill={skill} />
      </ShellPage>
    </>
  );
}

/**
 * One discovered skill, from the list data alone (decision G7: no version
 * history, no SKILL.md body — the catalog has neither): name and description
 * from the frontmatter, where it lives and the commit it was read at, the
 * agents using it, and a "View source" link into the repository at that
 * commit. "Edit" opens the add-skill flow prefilled (`EditSkillPage`), which
 * proposes the change as a pull request — only for a skill whose SKILL.md the
 * portal could read (`contentReadable`); otherwise a note says the portal
 * cannot read its source. "Evaluate" appears only where
 * `metaAgents.skillEvaluation` resolves, and starts a session with that agent
 * straight away — the prompt names the skill and asks for a report and an
 * improvement pull request — then opens it.
 *
 * Addressed as `<owner>/<repo>[/<skill dir>]` under `/agent-platform/skills`;
 * the skill itself is found in the discovered catalog, so an unknown address
 * is a not-found state, and an unreadable catalog says so instead.
 */
export function SkillDetailPage() {
  const splat = useParams()['*'] ?? '';
  const target = parseSkillDetailPath(splat);
  const catalog = useSkillCatalog();

  const skill = useMemo(() => {
    if (!target) {
      return undefined;
    }
    const wanted = canonicalSkillId(target);
    return catalog.skills.find(
      candidate => canonicalSkillId(candidate) === wanted,
    );
  }, [catalog.skills, target]);

  if (!target) {
    // Not even `owner/repo`: nothing to look up, back to the list.
    return <Navigate to={`${SHELL_CUSTOMIZE_PATH}/skills`} replace />;
  }

  if (skill) {
    return <SkillPage skill={skill} />;
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
