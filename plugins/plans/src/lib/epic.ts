/**
 * Hive's epic page: what it derives from the board item, the plans and the
 * magazine for one epic.
 */

import { EpicRef, PlanEpic, PullEpic } from '../apis';
import { Lane, MagazineCard, PlanCard } from './magazine';

/** A plan repository's epic references (`GET /epics?repo=`). */
export interface RepoEpics {
  repo: string;
  merged: PlanEpic[];
  pulls: PullEpic[];
}

/** The issue an epic is: `giantswarm/roadmap#4039`. */
export interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

export interface EpicPlans {
  /** Open plan PRs naming the epic. */
  pulls: { repo: string; number: number; title: string }[];
  /** Merged plan folders naming the epic. */
  merged: { repo: string; folder: string; path: string }[];
}

/** The issue of a board item, or undefined for a draft item. */
export function issueOfItem(item: {
  repository: { nameWithOwner: string } | null;
  number: number | '';
}): IssueRef | undefined {
  const [owner, repo] = item.repository?.nameWithOwner.split('/') ?? [];
  if (!owner || !repo || typeof item.number !== 'number') {
    return undefined;
  }
  return { owner, repo, number: item.number };
}

/** The magazine's key for an issue: `owner/repo#number`. */
export function issueKey(issue: IssueRef | undefined): string | undefined {
  return issue && `${issue.owner}/${issue.repo}#${issue.number}`;
}

function sameIssue(epic: EpicRef, issue: IssueRef): boolean {
  return (
    epic.owner === issue.owner &&
    epic.repo === issue.repo &&
    epic.number === issue.number
  );
}

/** The plans that name an issue as their epic. */
export function epicPlansOf(
  epics: RepoEpics[],
  issue: IssueRef | undefined,
): EpicPlans {
  if (!issue) {
    return { pulls: [], merged: [] };
  }
  return {
    pulls: epics.flatMap(entry =>
      entry.pulls
        .filter(pull => sameIssue(pull.epic, issue))
        .map(pull => ({
          repo: entry.repo,
          number: pull.number,
          title: pull.title,
        })),
    ),
    merged: epics.flatMap(entry =>
      entry.merged
        .filter(plan => sameIssue(plan.epic, issue))
        .map(plan => ({
          repo: entry.repo,
          folder: plan.folder,
          path: plan.path,
        })),
    ),
  };
}

/** The tabs of an epic's page, by path segment; Overview is the bare path. */
export const EPIC_TABS = [
  { id: 'overview', label: 'Overview', segment: '' },
  { id: 'plan', label: 'Plan', segment: 'plan' },
  { id: 'history', label: 'History', segment: 'history' },
  { id: 'sub-issues', label: 'Sub-issues', segment: 'sub-issues' },
] as const;

export type EpicTab = (typeof EPIC_TABS)[number]['id'];

/** The tab a path below the epic's page shows: `plan` → Plan. */
export function epicTabOf(splat: string): EpicTab {
  const segment = splat.split('/')[0];
  return (
    EPIC_TABS.find(tab => tab.segment && tab.segment === segment)?.id ??
    'overview'
  );
}

/** The plan state an epic reads with: its open PR's, else merged. */
export function epicPlanState(
  card: MagazineCard | undefined,
  plans: EpicPlans,
): PlanCard['state'] | undefined {
  if (card?.plan) {
    return card.plan.state;
  }
  if (plans.pulls.length > 0) {
    return 'review';
  }
  return plans.merged.length > 0 ? 'merged' : undefined;
}

/** The lane's anchor on Now, for the epic's breadcrumb. */
export function laneAnchor(lane: Lane): string {
  return `lane-${lane.id}`;
}
