/**
 * The workspace editor's draft: what the form holds, how it becomes the
 * workspace-manager's sources, and where the manager's validation message
 * belongs on the form.
 */

import type {
  CreateWorkspaceInput,
  TopicMatch,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceSizing,
  WorkspaceSource,
} from './workspaceManager';

/** One source as the form edits it: every list present, never undefined. */
export type SourceDraft = {
  /** Stable across edits, so React keeps each source's own state. */
  key: string;
  provider: string;
  owner: string;
  repositories: string[];
  languages: string[];
  topics: string[];
  topicMatch: TopicMatch;
  exclude: string[];
  includeArchived: boolean;
  includeForks: boolean;
};

export type WorkspaceDraft = {
  name: string;
  sources: SourceDraft[];
  /** Kubernetes quantities as typed; empty is unset. */
  headroom: string;
  minimum: string;
};

/** The manager's name rule (a Kubernetes object name, at most 63). */
export const WORKSPACE_NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
export const WORKSPACE_NAME_MAX = 63;

/** A Kubernetes quantity of bytes, as the sizing fields take it (`8Gi`). */
export const QUANTITY_RE = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P)?$/;

let sourceKeys = 0;

export function emptySource(provider = ''): SourceDraft {
  sourceKeys += 1;
  return {
    key: `source-${sourceKeys}`,
    provider,
    owner: '',
    repositories: [],
    languages: [],
    topics: [],
    topicMatch: 'any',
    exclude: [],
    includeArchived: false,
    includeForks: false,
  };
}

export function emptyDraft(provider = ''): WorkspaceDraft {
  return {
    name: '',
    sources: [emptySource(provider)],
    headroom: '',
    minimum: '',
  };
}

/** A stored workspace as the form's draft. */
export function draftFromWorkspace(workspace: Workspace): WorkspaceDraft {
  return {
    name: workspace.name,
    sources: workspace.sources.map(source => ({
      ...emptySource(source.provider),
      owner: source.owner,
      repositories: source.repositories ?? [],
      languages: source.filters?.languages ?? [],
      topics: source.filters?.topics?.names ?? [],
      topicMatch: source.filters?.topics?.match ?? 'any',
      exclude: source.exclude ?? [],
      includeArchived: source.includeArchived ?? false,
      includeForks: source.includeForks ?? false,
    })),
    headroom: workspace.sizing?.headroom ?? '',
    minimum: workspace.sizing?.minimum ?? '',
  };
}

/** Whether a source selects anything: by name, language or topic. */
export function hasSelector(source: SourceDraft): boolean {
  return (
    source.repositories.length > 0 ||
    source.languages.length > 0 ||
    source.topics.length > 0
  );
}

/** One source as the manager takes it, without its empty fields. */
export function toSource(source: SourceDraft): WorkspaceSource {
  const filters =
    source.languages.length > 0 || source.topics.length > 0
      ? {
          ...(source.languages.length > 0
            ? { languages: source.languages }
            : {}),
          ...(source.topics.length > 0
            ? { topics: { match: source.topicMatch, names: source.topics } }
            : {}),
        }
      : undefined;
  return {
    provider: source.provider,
    owner: source.owner.trim(),
    ...(source.repositories.length > 0
      ? { repositories: source.repositories }
      : {}),
    ...(filters ? { filters } : {}),
    ...(source.exclude.length > 0 ? { exclude: source.exclude } : {}),
    ...(source.includeArchived ? { includeArchived: true } : {}),
    ...(source.includeForks ? { includeForks: true } : {}),
  };
}

/** The sizing overrides as the manager takes them; `{}` clears them. */
export function toSizing(draft: WorkspaceDraft): WorkspaceSizing {
  return {
    ...(draft.headroom.trim() ? { headroom: draft.headroom.trim() } : {}),
    ...(draft.minimum.trim() ? { minimum: draft.minimum.trim() } : {}),
  };
}

/**
 * The sources a preview can be asked about: every one with a provider, an
 * owner and a selector. A source still being filled in is left out rather
 * than failing the preview of the rest.
 */
export function previewableSources(draft: WorkspaceDraft): WorkspaceSource[] {
  return draft.sources
    .filter(source => source.provider && source.owner.trim())
    .filter(hasSelector)
    .map(toSource);
}

export function toCreateInput(
  draft: WorkspaceDraft,
  organization: string,
): CreateWorkspaceInput {
  const sizing = toSizing(draft);
  return {
    name: draft.name.trim(),
    organization,
    sources: draft.sources.map(toSource),
    ...(Object.keys(sizing).length > 0 ? { sizing } : {}),
  };
}

export function toUpdateInput(
  draft: WorkspaceDraft,
  resourceVersion: string | undefined,
): UpdateWorkspaceInput {
  return {
    name: draft.name,
    sources: draft.sources.map(toSource),
    sizing: toSizing(draft),
    ...(resourceVersion ? { resourceVersion } : {}),
  };
}

/**
 * A form field's address: `name`, `sizing.headroom`, `sizing.minimum`,
 * `sources.<i>` (the source as a whole) or `sources.<i>.<field>` with field
 * one of provider, owner, repositories, languages, topics, exclude.
 */
export type DraftField = string;

/** The form's own checks, by field; the manager has the last word on save. */
export function draftProblems(
  draft: WorkspaceDraft,
  isEdit: boolean,
): Record<DraftField, string> {
  const problems: Record<DraftField, string> = {};
  const name = draft.name.trim();
  if (!isEdit) {
    if (!name) {
      problems.name = 'Name is required';
    } else if (
      name.length > WORKSPACE_NAME_MAX ||
      !WORKSPACE_NAME_RE.test(name)
    ) {
      problems.name =
        'Use at most 63 lowercase letters, digits and dashes, e.g. platform-mcp';
    }
  }
  draft.sources.forEach((source, index) => {
    if (!source.provider) {
      problems[`sources.${index}.provider`] = 'Choose a provider';
    }
    if (!source.owner.trim()) {
      problems[`sources.${index}.owner`] = 'Owner is required';
    }
    if (!hasSelector(source)) {
      problems[`sources.${index}`] =
        'Pick repositories by name, or filter by language or topic';
    }
  });
  for (const field of ['headroom', 'minimum'] as const) {
    const value = draft[field].trim();
    if (value && !QUANTITY_RE.test(value)) {
      problems[`sizing.${field}`] = 'Use a size such as 8Gi or 500Mi';
    }
  }
  return problems;
}

const SOURCE_FIELDS: Record<string, string> = {
  provider: 'provider',
  owner: 'owner',
  repositories: 'repositories',
  exclude: 'exclude',
  languages: 'languages',
  topics: 'topics',
};

/**
 * The field a manager's validation message names: the API server's
 * `spec.sources[1].owner: Invalid value…`, the manager's own
 * `sources[0]: unknown provider instance…` or `sizing.headroom "x": …`, the
 * object name's `metadata.name`. `undefined` when it names none, and the
 * message is the form's as a whole.
 */
export function fieldOfManagerMessage(message: string): DraftField | undefined {
  const source =
    /(?:spec\.)?sources\[(\d+)\](?:\.(?:filters\.)?([a-zA-Z]+))?/.exec(message);
  if (source) {
    const field = source[2] && SOURCE_FIELDS[source[2]];
    if (/unknown provider/.test(message)) {
      return `sources.${source[1]}.provider`;
    }
    return field ? `sources.${source[1]}.${field}` : `sources.${source[1]}`;
  }
  const sizing = /(?:spec\.)?sizing\.(headroom|minimum)/.exec(message);
  if (sizing) {
    return `sizing.${sizing[1]}`;
  }
  if (
    /metadata\.name|\bname\b.*(must|invalid|lowercase|RFC 1123)/i.test(message)
  ) {
    return 'name';
  }
  return undefined;
}

/** The manager's message without its operation prefix, for the field. */
export function managerMessageText(message: string): string {
  return message.replace(/^[a-z_]+: invalid workspace: /, '');
}
