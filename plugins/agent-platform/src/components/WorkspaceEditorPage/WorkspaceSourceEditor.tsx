import { useMemo, type ReactNode } from 'react';
import { Button, Flex, Select, Text, TextField } from '@backstage/ui';
import {
  fieldErrorProps,
  searchableIf,
} from '@giantswarm/backstage-plugin-ui-react';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import {
  useProviderOwners,
  useRepositoriesPage,
} from '../../hooks/useWorkspaceEditor';
import type { SourceDraft } from '../../lib/workspaceDraft';
import {
  providerKindName,
  providerOptionLabel,
  signedInLine,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';
import { filterInput, RepositoryPicker } from './RepositoryPicker';
import { repositoryNoun } from './repositoryNoun';
import { SourceFilterBox } from './SourceFilterBox';

export type WorkspaceSourceEditorProps = {
  client: WorkspaceManagerClient;
  organization: string;
  index: number;
  source: SourceDraft;
  providers: WorkspaceProvider[];
  onChange: (source: SourceDraft) => void;
  /** Absent while it is the only source. */
  onRemove?: () => void;
  onRecheckProviders: () => void;
  /** The problem shown on each of the source's fields, by field. */
  errorFor: (field: string) => string | undefined;
  /** Marks a field the person left, so its problem shows at once. */
  touch: (field: string) => void;
  /**
   * Set when the source shows collapsed, as a summary with Edit source:
   * the edit flow opens one source at a time.
   */
  onExpand?: () => void;
};

/**
 * How many of the owner's repositories a source takes: its filter matches
 * (one row of the filtered listing tells the total) less its exclusions,
 * plus its picks by name. Also the owner's facets, from one unfiltered row.
 */
function useSourceCounts(
  client: WorkspaceManagerClient | undefined,
  organization: string,
  source: SourceDraft,
) {
  const owner = source.owner.trim();
  const base =
    owner && source.provider
      ? { organization, provider: source.provider, owner, page: 1, pageSize: 1 }
      : undefined;
  const hasFilters = source.languages.length > 0 || source.topics.length > 0;
  const facets = useRepositoriesPage(client, base);
  const matches = useRepositoriesPage(
    client,
    base && hasFilters ? { ...base, ...filterInput(source) } : undefined,
  );
  let matchTotal: number | undefined = hasFilters ? matches.data?.total : 0;
  if (base === undefined) {
    matchTotal = undefined;
  }
  const total =
    matchTotal === undefined
      ? undefined
      : matchTotal - source.exclude.length + source.repositories.length;
  return { facets, matchTotal, total };
}

/** What a source selects, in short: `lang Go`, `topic mcp`, `1 by name`. */
function selectionParts(source: SourceDraft): string[] {
  const joiner = source.topicMatch === 'all' ? ' + ' : ', ';
  return [
    source.languages.length > 0
      ? `lang ${source.languages.join(', ')}`
      : undefined,
    source.topics.length > 0
      ? `topic ${source.topics.join(joiner)}`
      : undefined,
    source.repositories.length > 0
      ? `${source.repositories.length} by name`
      : undefined,
    source.exclude.length > 0 ? `${source.exclude.length} excluded` : undefined,
  ].filter((part): part is string => Boolean(part));
}

/** A source's frame: its header line, and what it holds. */
function SourceCard({
  index,
  label,
  aside,
  children,
}: {
  index: number;
  label: ReactNode;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={`workspace-source-${index}`}
      aria-label={`Source ${index + 1}`}
      style={{
        border: '1px solid var(--bui-border-1)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <Flex direction="column" gap="3">
        <Flex
          justify="between"
          align="center"
          gap="2"
          style={{ flexWrap: 'wrap' }}
        >
          {label}
          <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
            {aside}
          </Flex>
        </Flex>
        {children}
      </Flex>
    </section>
  );
}

/**
 * One source of a workspace: a provider instance, an owner on it, and what
 * it selects — a language, topic and including filter, and one table of the
 * owner's repositories to pick by name or exclude. A provider the person has
 * not granted shows its sign-in in place of the owner; the draft stays as it
 * is meanwhile. Collapsed (`onExpand`), it is a summary line.
 */
export function WorkspaceSourceEditor({
  client,
  organization,
  index,
  source,
  providers,
  onChange,
  onRemove,
  onRecheckProviders,
  errorFor,
  touch,
  onExpand,
}: WorkspaceSourceEditorProps) {
  const provider = providers.find(p => p.name === source.provider);
  const isConnected = provider?.connected ?? false;
  const field = (name: string) => errorFor(`sources.${index}.${name}`);
  const kind = provider?.kind;
  const counts = useSourceCounts(
    isConnected ? client : undefined,
    organization,
    source,
  );
  const owners = useProviderOwners(
    isConnected ? client : undefined,
    organization,
    source.provider || undefined,
  );
  // The owners to pick from, the stored one too; none from a manager before
  // `list_owners`, which leaves the owner a text field.
  const ownerOptions = useMemo(() => {
    const names = (owners.data ?? []).map(o => o.name);
    const owner = source.owner.trim();
    if (names.length === 0) {
      return [];
    }
    return owner && !names.includes(owner) ? [owner, ...names] : names;
  }, [owners.data, source.owner]);
  const signedIn = provider && isConnected && (
    <Text variant="body-small" color="secondary">
      {signedInLine(provider)}
    </Text>
  );

  if (onExpand) {
    const totalLine =
      counts.total === undefined
        ? undefined
        : `${counts.total} ${repositoryNoun(kind, counts.total)}`;
    return (
      <SourceCard
        index={index}
        label={
          <Flex direction="column" gap="1">
            <Text variant="body-medium" weight="bold">
              {provider ? providerKindName(provider.kind) : source.provider} ·{' '}
              {source.owner}
            </Text>
            <Text variant="body-small" color="secondary">
              {[...selectionParts(source), totalLine]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Flex>
        }
        aside={
          <>
            {signedIn}
            <Button variant="secondary" size="small" onPress={onExpand}>
              Edit source
            </Button>
          </>
        }
      >
        {errorFor(`sources.${index}`) && (
          <Text variant="body-small" color="danger" role="alert">
            {errorFor(`sources.${index}`)}
          </Text>
        )}
      </SourceCard>
    );
  }

  return (
    <SourceCard
      index={index}
      label={
        <Text variant="title-x-small" as="h3">
          Source {index + 1}
        </Text>
      }
      aside={
        <>
          {signedIn}
          {onRemove && (
            <Button variant="tertiary" size="small" onPress={onRemove}>
              Remove source
            </Button>
          )}
        </>
      }
    >
      {providers.length > 1 ? (
        <Select
          label="Provider"
          isRequired
          searchable={searchableIf(providers)}
          options={providers.map(p => ({
            id: p.name,
            label: providerOptionLabel(p),
          }))}
          selectedKey={source.provider || null}
          onSelectionChange={key => {
            if (key && String(key) !== source.provider) {
              onChange({ ...source, provider: String(key), owner: '' });
            }
          }}
          {...fieldErrorProps(field('provider'))}
        />
      ) : null}
      {providers.length <= 1 && field('provider') && (
        <Text variant="body-small" color="danger">
          {field('provider')}
        </Text>
      )}

      {provider && !isConnected ? (
        <ProviderConnectPrompt
          installation={client.installation}
          provider={provider}
          onConnected={onRecheckProviders}
        />
      ) : (
        <>
          {ownerOptions.length > 0 ? (
            <Select
              label="Owner"
              isRequired
              searchable={searchableIf(ownerOptions)}
              options={ownerOptions.map(name => ({ id: name, label: name }))}
              selectedKey={source.owner.trim() || null}
              onSelectionChange={key => {
                if (key) {
                  onChange({ ...source, owner: String(key) });
                  touch(`sources.${index}.owner`);
                }
              }}
              {...fieldErrorProps(field('owner'))}
            />
          ) : (
            <TextField
              label="Owner"
              isRequired
              description={`The ${
                kind ? providerKindName(kind) : 'provider'
              } organization, group or user whose ${repositoryNoun(
                kind,
                2,
              )} this source picks from, e.g. giantswarm.`}
              value={source.owner}
              onChange={value => onChange({ ...source, owner: value })}
              onBlur={() => touch(`sources.${index}.owner`)}
              {...fieldErrorProps(field('owner'))}
            />
          )}

          {source.owner.trim() && (
            <>
              <SourceFilterBox
                source={source}
                onChange={onChange}
                facetsPage={counts.facets.data}
                matchTotal={counts.matchTotal}
                providerKind={kind}
              />
              {(field('languages') || field('topics')) && (
                <Text variant="body-small" color="danger">
                  {field('languages') ?? field('topics')}
                </Text>
              )}
              <RepositoryPicker
                client={client}
                organization={organization}
                source={source}
                onChange={onChange}
                matchTotal={counts.matchTotal}
                providerKind={kind}
              />
              {(field('repositories') || field('exclude')) && (
                <Text variant="body-small" color="danger">
                  {field('repositories') ?? field('exclude')}
                </Text>
              )}
            </>
          )}
        </>
      )}

      {errorFor(`sources.${index}`) && (
        <Text variant="body-small" color="danger" role="alert">
          {errorFor(`sources.${index}`)}
        </Text>
      )}
    </SourceCard>
  );
}
