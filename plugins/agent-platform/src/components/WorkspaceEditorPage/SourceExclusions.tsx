import { useMemo, useState } from 'react';
import { Combobox, Flex, Tag, TagGroup, Text } from '@backstage/ui';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import { useSourcePreview } from '../../hooks/useWorkspaceEditor';
import type { SourceDraft } from '../../lib/workspaceDraft';
import {
  exclusionsOutsidePicks,
  hasFilters,
  includesName,
} from '../../lib/workspaceSelection';
import { repositoryNoun } from './repositoryNoun';
import { whyText } from './WorkspacePreviewPanel';

/** The option that excludes the name as typed, ahead of a repository's id. */
const TYPED = 'typed:';

/**
 * What the exclusions do now: how many selected repositories they leave
 * out, and how many match nothing the source selects. `excluded` is
 * undefined while the manager counts a source with filters.
 */
export function exclusionEffect(
  source: SourceDraft,
  excluded: number | undefined,
  providerKind: string | undefined,
): string | undefined {
  const count = source.exclude.length;
  if (count === 0 || excluded === undefined) {
    return undefined;
  }
  // An exclusion is one repository's name: it leaves out one at most.
  const idle = count - excluded;
  const leftOut = `${excluded} ${repositoryNoun(providerKind, excluded)} left out`;
  if (idle === 0) {
    return `${leftOut}.`;
  }
  const nothing =
    idle === 1
      ? '1 exclusion matches nothing the source selects'
      : `${idle} exclusions match nothing the source selects`;
  if (excluded === 0) {
    return `Nothing is left out: ${
      count === 1 ? 'the exclusion matches' : `the ${count} exclusions match`
    } nothing the source selects.`;
  }
  // Without filters the form knows which ones: they name no pick.
  const names = hasFilters(source)
    ? ''
    : `: ${exclusionsOutsidePicks(source).join(', ')}`;
  return `${leftOut}; ${nothing}${names}.`;
}

export type SourceExclusionsProps = {
  client: WorkspaceManagerClient;
  organization: string;
  source: SourceDraft;
  onChange: (source: SourceDraft) => void;
  /** How many selected repositories the exclusions leave out, when known. */
  excluded: number | undefined;
  providerKind: string | undefined;
  /** The manager's message about the exclusions, from a refused save. */
  error: string | undefined;
};

/**
 * A source's exclusions: each a tag to remove, what they leave out now, and
 * a field to add one. The field offers the repositories the source selects
 * now, as the manager resolves it, and takes a name as typed: the manager
 * keeps an exclusion that matches nothing, for a repository a filter may
 * select later. An exclusion wins over a pick by name too.
 */
export function SourceExclusions({
  client,
  organization,
  source,
  onChange,
  excluded,
  providerKind,
  error,
}: SourceExclusionsProps) {
  const [typed, setTyped] = useState('');
  // The selection is read once the person turns to the field.
  const [isActive, setIsActive] = useState(false);
  const selection = useSourcePreview(client, organization, source, {
    enabled: isActive,
    search: typed.trim(),
  });
  const owner = source.owner.trim();
  const noun = repositoryNoun(providerKind, 2);

  const options = useMemo(() => {
    const name = typed.trim();
    const selected = (selection.data?.repositories ?? [])
      .filter(repository => repository.provider === source.provider)
      .map(repository => ({
        id: repository.repository.slice(owner.length + 1),
        description: whyText(repository.why),
      }))
      .filter(option => !includesName(source.exclude, option.id))
      .map(option => ({ ...option, label: option.id }));
    const isListed =
      includesName(
        selected.map(option => option.id),
        name,
      ) || includesName(source.exclude, name);
    return name && !isListed
      ? [
          ...selected,
          {
            id: `${TYPED}${name}`,
            label: `Exclude “${name}”`,
            description: `Not among the ${noun} the source selects now`,
          },
        ]
      : selected;
  }, [selection.data, source, owner, typed, noun]);

  const add = (key: string) => {
    const name = key.startsWith(TYPED) ? key.slice(TYPED.length) : key;
    if (name && !includesName(source.exclude, name)) {
      onChange({ ...source, exclude: [...source.exclude, name] });
    }
    setTyped('');
  };
  const effect = exclusionEffect(source, excluded, providerKind);

  return (
    <section
      aria-label="Exclusions"
      data-testid="source-exclusions"
      style={{
        border: '1px solid var(--bui-border-1)',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2">
          <Text variant="body-small" weight="bold">
            Exclusions
          </Text>
          {source.exclude.length > 0 && (
            <Text variant="body-small" color="secondary">
              {source.exclude.length}
            </Text>
          )}
        </Flex>
        <Text variant="body-small" color="secondary">
          An excluded {repositoryNoun(providerKind, 1)} stays out even when a
          filter or a pick by name selects it.
        </Text>
        {source.exclude.length > 0 ? (
          <TagGroup
            aria-label={`Excluded ${noun}`}
            onRemove={keys =>
              onChange({
                ...source,
                exclude: source.exclude.filter(name => !keys.has(name)),
              })
            }
          >
            {source.exclude.map(name => (
              // A long name is cut short at phone width, its remove button
              // kept in view.
              <Tag
                key={name}
                id={name}
                size="small"
                textValue={name}
                style={{ maxWidth: '100%' }}
              >
                <span
                  title={name}
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </span>
              </Tag>
            ))}
          </TagGroup>
        ) : (
          <Text variant="body-small" color="secondary">
            Nothing excluded.
          </Text>
        )}
        {effect && (
          <Text
            variant="body-small"
            color="secondary"
            data-testid="exclusion-effect"
          >
            {effect}
          </Text>
        )}
        <div style={{ maxWidth: 420 }}>
          <Combobox
            label={`Exclude a ${repositoryNoun(providerKind, 1)}`}
            description={`Lists the ${noun} the source selects now. Type a full name to exclude one it does not select yet.`}
            placeholder={`Search the selected ${noun}`}
            options={options}
            search={{
              mode: 'server',
              inputValue: typed,
              onInputChange: setTyped,
            }}
            loading={{
              state: isActive && selection.isFetching ? 'loading' : 'idle',
            }}
            selectedKey={null}
            onSelectionChange={key => {
              if (key !== null) {
                add(String(key));
              }
            }}
            onFocus={() => setIsActive(true)}
          />
        </div>
        {error && (
          <Text variant="body-small" color="danger" role="alert">
            {error}
          </Text>
        )}
      </Flex>
    </section>
  );
}
