import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Selection } from 'react-aria-components';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Flex,
  List,
  ListRow,
} from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import {
  compareDisplayPaths,
  friendlyFileName,
  isDotPath,
  isRenderableFile,
  stripFolderPrefix,
} from '../../lib/files';
import { EpicChip } from '../EpicChip';
import { PlanFileContent } from '../PlanFileContent';

const useStyles = makeStyles((theme: Theme) => ({
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: theme.spacing(2),
    alignItems: 'start',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
    },
  },
  // The file path in each accordion trigger, so a long plan reads as a
  // navigable stack of documents rather than one wall of text.
  fileName: {
    fontFamily: 'monospace',
  },
  // bui's accordion trigger has no bottom padding, so an expanded header sits
  // flush against the document below it. Add breathing room only when
  // expanded — a collapsed header would otherwise look top-heavy.
  accordionGroup: {
    '& .bui-AccordionTriggerButton[aria-expanded="true"]': {
      paddingBottom: theme.spacing(1),
    },
  },
}));

interface PlanGroup {
  name: string;
  files: string[];
}

/**
 * Merged plans: renderable documents on the default branch, grouped by their
 * top-level folder (one folder per plan by convention; loose root documents
 * are grouped under a synthetic root entry).
 */
export function MergedTab({ repo }: { repo: string }) {
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  // The selected plan lives in `?plan=` so the roadmap epic view (and
  // anyone with the URL) can deep-link a specific plan.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('plan') ?? undefined;
  const selectPlan = (name: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', name);
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'tree', repo],
    queryFn: () => plansApi.getTree(undefined, repo),
  });

  // Epic references per plan folder, for the cross-link chips. Failure just
  // means no chips (e.g. the backend still rolling out).
  const { data: epicsData } = useQuery({
    queryKey: ['plans', 'epics', repo],
    queryFn: () => plansApi.listEpics(repo),
    retry: false,
  });
  const epicByFolder = useMemo(
    () =>
      new Map((epicsData?.merged ?? []).map(entry => [entry.folder, entry])),
    [epicsData],
  );

  const groups = useMemo<PlanGroup[]>(() => {
    const byFolder = new Map<string, string[]>();
    for (const entry of data?.tree ?? []) {
      if (entry.type !== 'blob' || !entry.path) {
        continue;
      }
      if (!isRenderableFile(entry.path)) {
        continue;
      }
      // Hide dot files/folders (e.g. `.agents/…`) and loose repository-root
      // documents — a plan is a top-level folder of documents.
      if (isDotPath(entry.path)) {
        continue;
      }
      const slash = entry.path.indexOf('/');
      if (slash === -1) {
        continue;
      }
      const folder = entry.path.slice(0, slash);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), entry.path]);
    }
    return [...byFolder.entries()]
      .map(([name, files]) => ({
        name,
        files: [...files].sort(compareDisplayPaths),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Alert
        status="danger"
        title="Failed to load merged plans"
        description={(error as Error).message}
      />
    );
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No merged plans"
        description={`No plan documents were found on the default branch of ${repo}.`}
      />
    );
  }

  const selectedGroup =
    groups.find(group => group.name === selected) ?? groups[0];

  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all' || selection.size === 0) {
      return;
    }
    selectPlan(String(selection.values().next().value));
  };

  return (
    <div className={classes.layout}>
      <List
        aria-label="Merged plans"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set([selectedGroup.name])}
        onSelectionChange={onSelectionChange}
      >
        {groups.map(group => (
          <ListRow
            key={group.name}
            id={group.name}
            textValue={group.name}
            description={`${group.files.length} document${
              group.files.length === 1 ? '' : 's'
            }`}
            customActions={
              epicByFolder.has(group.name) ? (
                <EpicChip epic={epicByFolder.get(group.name)!.epic} />
              ) : undefined
            }
          >
            {group.name}
          </ListRow>
        ))}
      </List>
      <Flex direction="column" gap="3">
        {data?.truncated && (
          <Alert
            status="warning"
            title="Truncated repository tree"
            description="The repository tree was truncated by GitHub; some documents may be missing."
          />
        )}
        {/* One accordion per document, all expanded by default so the plan
            reads top-to-bottom while still being collapsible when long. Keying
            the group by folder remounts it on selection change, so a newly
            selected plan's documents start expanded too (defaultExpandedKeys
            only applies on mount). */}
        <AccordionGroup
          key={selectedGroup.name}
          className={classes.accordionGroup}
          allowsMultiple
          defaultExpandedKeys={new Set(selectedGroup.files)}
        >
          {selectedGroup.files.map(path => {
            const displayPath = stripFolderPrefix(path, selectedGroup.name);
            const friendly = friendlyFileName(displayPath);
            return (
              <Accordion key={path} id={path}>
                <AccordionTrigger>
                  {friendly ? (
                    <span>
                      {friendly}{' '}
                      <span className={classes.fileName}>({displayPath})</span>
                    </span>
                  ) : (
                    <span className={classes.fileName}>{displayPath}</span>
                  )}
                </AccordionTrigger>
                <AccordionPanel>
                  <PlanFileContent repo={repo} refName="HEAD" path={path} />
                </AccordionPanel>
              </Accordion>
            );
          })}
        </AccordionGroup>
      </Flex>
    </div>
  );
}
