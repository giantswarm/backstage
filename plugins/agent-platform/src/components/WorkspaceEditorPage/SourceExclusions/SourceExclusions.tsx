import { useMemo, useState } from 'react';
import { Combobox, Flex, Tag, TagGroup, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useSelectFieldError } from '@giantswarm/backstage-plugin-ui-react';

import type { WorkspaceManagerClient } from '../../../apis/WorkspaceManagerClient';
import { useSourcePreview } from '../../../hooks/useWorkspaceEditor';
import type { SourceDraft } from '../../../lib/workspaceDraft';
import { includesName } from '../../../lib/workspaceSelection';
import { repositoryNoun } from '../repositoryNoun';
import { exclusionEffect } from '../sourceCount';
import { whyText } from '../WorkspacePreviewPanel';

/**
 * The option that excludes the name as typed, ahead of the name: `typed:`
 * while nothing is known about it, `unselected:` once a fresh answer shows
 * the source does not select it. Two ids, since the list keeps an option's
 * content by its id.
 */
const TYPED = 'typed:';
const UNSELECTED = 'unselected:';

const useStyles = makeStyles({
  // A medium tag's text is 12px (`--bui-font-size-2`); its remove button,
  // 16px in bui, gets a 24px target to tap.
  tags: {
    '& .bui-TagRemoveButton': {
      minWidth: 24,
      minHeight: 24,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
  },
});

/** The name an option excludes. */
function nameOf(key: string): string {
  for (const prefix of [TYPED, UNSELECTED]) {
    if (key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }
  }
  return key;
}

/**
 * A preview row's repository name: its path's last part. The manager reports
 * `<owner>/<name>`, and a name never holds a slash (a GitLab project in a
 * subgroup is `group/sub~project`), so this is the name an exclusion matches.
 */
export function repositoryName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
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
  // The selection is read only while the field's list is open.
  const [isOpen, setIsOpen] = useState(false);
  const selection = useSourcePreview(client, organization, source, {
    enabled: isOpen,
    search: typed.trim(),
  });
  const classes = useStyles();
  const noun = repositoryNoun(providerKind, 2);
  const errorProps = useSelectFieldError(error);

  const options = useMemo(() => {
    const name = typed.trim();
    const selected = (selection.data?.repositories ?? [])
      .filter(repository => repository.provider === source.provider)
      .map(repository => ({
        id: repositoryName(repository.repository),
        description: whyText(repository.why),
      }))
      .filter(option => !includesName(source.exclude, option.id))
      .map(option => ({ ...option, label: option.id }));
    const isListed =
      includesName(
        selected.map(option => option.id),
        name,
      ) || includesName(source.exclude, name);
    // Only a fresh answer for this very search, with every match on its one
    // page, tells that the source does not select the name.
    const isComplete =
      selection.data !== undefined &&
      !selection.isStale &&
      !selection.error &&
      selection.data.matching <= selection.data.repositories.length;
    return name && !isListed
      ? [
          ...selected,
          {
            id: `${isComplete ? UNSELECTED : TYPED}${name}`,
            label: `Exclude “${name}”`,
            ...(isComplete
              ? { description: `Not among the ${noun} the source selects now` }
              : {}),
          },
        ]
      : selected;
  }, [selection.data, selection.isStale, selection.error, source, typed, noun]);

  const add = (key: string) => {
    const name = nameOf(key);
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
            className={classes.tags}
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
                size="medium"
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
              state: isOpen && selection.isFetching ? 'loading' : 'idle',
            }}
            selectedKey={null}
            onSelectionChange={key => {
              if (key !== null) {
                add(String(key));
              }
            }}
            onOpenChange={setIsOpen}
            {...errorProps.selectProps}
          />
          {errorProps.message}
        </div>
      </Flex>
    </section>
  );
}
