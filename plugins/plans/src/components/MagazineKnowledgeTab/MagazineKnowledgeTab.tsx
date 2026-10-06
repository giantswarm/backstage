import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { MagazineSource } from '../../hooks/useMagazineJson';
import { KNOWLEDGE_CATEGORIES, knowledgeDocs } from '../../lib/magazine';
import { PlanFileContent } from '../PlanFileContent';
import { PlansErrorAlert } from '../PlansErrorAlert';

const useStyles = makeStyles((theme: Theme) => ({
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: theme.spacing(3),
    alignItems: 'start',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 3fr)',
    },
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
  },
  current: {
    fontWeight: 'bold',
  },
}));

/**
 * The team's knowledge: product, architecture and decision documents from
 * the knowledge ref, one rendered at a time; `?doc=<path>` deep-links one.
 */
export function MagazineKnowledgeTab(props: { source: MagazineSource }) {
  const { source } = props;
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'tree', source.repository, source.ref],
    queryFn: () => plansApi.getTree(source.ref, source.repository),
  });
  const docs = useMemo(() => knowledgeDocs(data?.tree ?? []), [data]);

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <PlansErrorAlert
        title="Failed to load the knowledge documents"
        error={error as Error}
      />
    );
  }

  const all = KNOWLEDGE_CATEGORIES.flatMap(category => docs[category.id]);
  if (all.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No knowledge documents yet"
        description="Markdown files under knowledge/product, knowledge/architecture and knowledge/decisions appear here."
      />
    );
  }
  const requested = searchParams.get('doc');
  const selected = all.find(doc => doc.path === requested) ?? all[0];

  const docHref = (path: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('doc', path);
    return `${location.pathname}?${params.toString()}`;
  };

  return (
    <div className={classes.layout}>
      <nav aria-label="Knowledge documents">
        <Flex direction="column" gap="4">
          {KNOWLEDGE_CATEGORIES.map(category => (
            <div key={category.id}>
              <Text as="h3" variant="title-x-small">
                {category.title}
              </Text>
              {docs[category.id].length === 0 ? (
                <Text variant="body-small" color="secondary">
                  None yet.
                </Text>
              ) : (
                <ul className={classes.list}>
                  {docs[category.id].map(doc => (
                    <li key={doc.path}>
                      <Link
                        href={docHref(doc.path)}
                        variant="body-small"
                        aria-current={
                          doc.path === selected.path ? 'page' : undefined
                        }
                        className={
                          doc.path === selected.path
                            ? classes.current
                            : undefined
                        }
                      >
                        {doc.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Flex>
      </nav>
      <article aria-label={selected.title}>
        <PlanFileContent
          repo={source.repository}
          refName={source.ref}
          path={selected.path}
        />
      </article>
    </div>
  );
}
