import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Flex,
  SearchField,
  Select,
  Text,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import {
  fieldErrorProps,
  searchableIf,
} from '@giantswarm/backstage-plugin-ui-react';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import { useRepositoriesPage } from '../../hooks/useWorkspaceEditor';
import type { SourceDraft } from '../../lib/workspaceDraft';
import {
  providerDisplayName,
  providerKindName,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import { ProviderConnectPrompt } from '../ProviderConnectPrompt';
import { RepositoryPicker } from './RepositoryPicker';

/** How many topics show before the topic search narrows them. */
const TOPICS_SHOWN = 30;

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
};

/** A multi-select of chips: each one a toggle, pressed when selected. */
function ChipSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="multiple"
      selectedKeys={selected}
      onSelectionChange={keys => onChange([...keys].map(String))}
      style={{ flexWrap: 'wrap' }}
    >
      {options.map(option => (
        <ToggleButton key={option} id={option} size="small">
          {option}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * One source of a workspace: a provider instance, an owner on it, and what
 * it selects — repositories by name, a language and a topic filter,
 * exclusions, and whether archived repositories and forks count. A provider
 * the person has not connected shows its connect prompt in place of the
 * owner; the draft stays as it is meanwhile.
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
}: WorkspaceSourceEditorProps) {
  const provider = providers.find(p => p.name === source.provider);
  const isConnected = provider?.connected ?? false;
  const owner = source.owner.trim();
  const field = (name: string) => errorFor(`sources.${index}.${name}`);

  // The owner's languages and topics: one row of one page tells them.
  const facets = useRepositoriesPage(
    isConnected ? client : undefined,
    owner && source.provider
      ? {
          organization,
          provider: source.provider,
          owner,
          page: 1,
          pageSize: 1,
        }
      : undefined,
  );
  const languages = useMemo(
    () => [
      ...new Set([...source.languages, ...(facets.data?.languages ?? [])]),
    ],
    [source.languages, facets.data?.languages],
  );
  const [topicSearch, setTopicSearch] = useState('');
  const topics = useMemo(() => {
    const all = [...new Set([...(facets.data?.topics ?? [])])].filter(
      topic => !source.topics.includes(topic),
    );
    const query = topicSearch.trim().toLowerCase();
    const shown = (query ? all.filter(t => t.includes(query)) : all).slice(
      0,
      TOPICS_SHOWN,
    );
    return [...source.topics, ...shown];
  }, [facets.data?.topics, source.topics, topicSearch]);
  const topicCount = facets.data?.topics.length ?? 0;
  // Why there is nothing to choose from yet, before the owner's listing.
  let facetsHint: string | undefined;
  if (!source.provider) {
    facetsHint = 'Choose the provider first.';
  } else if (!owner) {
    facetsHint = 'Enter the owner first.';
  } else if (facets.isLoading) {
    facetsHint = 'Reading the owner’s repositories…';
  }

  return (
    // A rule on the left, aligned with the column, marks the source's fields
    // without indenting them.
    <section
      data-testid={`workspace-source-${index}`}
      aria-label={`Source ${index + 1}`}
      style={{
        borderLeft: '2px solid var(--bui-border-1)',
        paddingLeft: 16,
      }}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Text variant="title-x-small" as="h3">
            Source {index + 1}
          </Text>
          {onRemove && (
            <Button variant="tertiary" size="small" onPress={onRemove}>
              Remove source
            </Button>
          )}
        </Flex>

        {providers.length > 1 ? (
          <Select
            label="Provider"
            isRequired
            searchable={searchableIf(providers)}
            options={providers.map(p => ({
              id: p.name,
              label: providerDisplayName(p),
            }))}
            selectedKey={source.provider || null}
            onSelectionChange={key => {
              if (key) {
                onChange({ ...source, provider: String(key) });
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
            onRecheck={onRecheckProviders}
          />
        ) : (
          <>
            <TextField
              label="Owner"
              isRequired
              description={`The ${
                provider ? providerKindName(provider.kind) : 'provider'
              } organization or user whose repositories this source picks from, e.g. giantswarm.`}
              value={source.owner}
              onChange={value => onChange({ ...source, owner: value })}
              onBlur={() => touch(`sources.${index}.owner`)}
              {...fieldErrorProps(field('owner'))}
            />

            <Flex direction="column" gap="1">
              <Text variant="body-small" weight="bold">
                Primary language, any of
              </Text>
              {languages.length > 0 ? (
                <ChipSelect
                  label="Languages"
                  options={languages}
                  selected={source.languages}
                  onChange={next => onChange({ ...source, languages: next })}
                />
              ) : (
                <Text variant="body-small" color="secondary">
                  {facetsHint ?? 'No languages reported.'}
                </Text>
              )}
              {field('languages') && (
                <Text variant="body-small" color="danger">
                  {field('languages')}
                </Text>
              )}
            </Flex>

            <Flex direction="column" gap="1">
              <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
                <Text variant="body-small" weight="bold">
                  Topics
                </Text>
                <ToggleButtonGroup
                  aria-label="Topics match"
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[source.topicMatch]}
                  onSelectionChange={keys => {
                    const next = [...keys][0];
                    if (next === 'any' || next === 'all') {
                      onChange({ ...source, topicMatch: next });
                    }
                  }}
                >
                  <ToggleButton id="any" size="small">
                    Any of
                  </ToggleButton>
                  <ToggleButton id="all" size="small">
                    All of
                  </ToggleButton>
                </ToggleButtonGroup>
                {topicCount > TOPICS_SHOWN && (
                  <SearchField
                    aria-label="Search topics"
                    placeholder="Search topics"
                    size="small"
                    value={topicSearch}
                    onChange={setTopicSearch}
                  />
                )}
              </Flex>
              {topics.length > 0 ? (
                <ChipSelect
                  label="Topics"
                  options={topics}
                  selected={source.topics}
                  onChange={next => onChange({ ...source, topics: next })}
                />
              ) : (
                <Text variant="body-small" color="secondary">
                  {facetsHint ?? 'No topics reported.'}
                </Text>
              )}
              {field('topics') && (
                <Text variant="body-small" color="danger">
                  {field('topics')}
                </Text>
              )}
            </Flex>

            <Flex gap="4" style={{ flexWrap: 'wrap' }}>
              <Checkbox
                isSelected={source.includeArchived}
                onChange={on => onChange({ ...source, includeArchived: on })}
              >
                Archived repositories count
              </Checkbox>
              <Checkbox
                isSelected={source.includeForks}
                onChange={on => onChange({ ...source, includeForks: on })}
              >
                Forks count
              </Checkbox>
            </Flex>

            <Flex direction="column" gap="1">
              <Text variant="body-small" weight="bold">
                Repositories
              </Text>
              <Text variant="body-small" color="secondary">
                Pick repositories by name (they count even when archived or a
                fork), or exclude one the filters take.
              </Text>
              <RepositoryPicker
                client={client}
                organization={organization}
                source={source}
                onChange={onChange}
              />
              {(field('repositories') || field('exclude')) && (
                <Text variant="body-small" color="danger">
                  {field('repositories') ?? field('exclude')}
                </Text>
              )}
            </Flex>
          </>
        )}

        {errorFor(`sources.${index}`) && (
          <Text variant="body-small" color="danger" role="alert">
            {errorFor(`sources.${index}`)}
          </Text>
        )}
      </Flex>
    </section>
  );
}
