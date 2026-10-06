import { useLocation, useSearchParams } from 'react-router-dom';
import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { EmptyState } from '@backstage/core-components';
import { GSMarkdownContent } from '@giantswarm/backstage-plugin-ui-react';
import {
  useHiveKnowledgeDoc,
  useHiveKnowledgeDocs,
  useHiveSearch,
} from '../../hooks/useHive';
import { matchesSearch } from '../../lib/hive';
import { KNOWLEDGE_CATEGORIES } from '../../lib/magazine';
import { HiveSourceState } from '../HiveSourceState';

const useStyles = makeStyles((theme: Theme) => ({
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: theme.spacing(4),
    alignItems: 'start',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: '260px minmax(0, 860px)',
    },
  },
  nav: {
    [theme.breakpoints.up('md')]: {
      position: 'sticky',
      top: 'var(--bui-space-4)',
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

function KnowledgeDocument(props: { path: string }) {
  const { data, isLoading, error } = useHiveKnowledgeDoc(props.path);
  if (data === undefined) {
    return (
      <HiveSourceState
        isLoading={isLoading}
        error={error}
        what="the document"
      />
    );
  }
  return <GSMarkdownContent content={data} />;
}

/**
 * Knowledge: the team's product, architecture and decision documents, one
 * read at a time; `?doc=<path>` links one, the header search narrows the list.
 */
export function HiveKnowledgeTab() {
  const classes = useStyles();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [query] = useHiveSearch();
  const { data: docs, isLoading, error } = useHiveKnowledgeDocs();

  if (!docs) {
    return (
      <HiveSourceState
        isLoading={isLoading}
        error={error}
        what="the knowledge documents"
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
  const selected =
    all.find(doc => doc.path === searchParams.get('doc')) ?? all[0];
  const docHref = (path: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('doc', path);
    return `${location.pathname}?${params.toString()}`;
  };

  return (
    <div className={classes.layout}>
      <nav aria-label="Knowledge documents" className={classes.nav}>
        <Flex direction="column" gap="4">
          {KNOWLEDGE_CATEGORIES.map(category => {
            const shown = docs[category.id].filter(doc =>
              matchesSearch(query, [doc.title]),
            );
            return (
              <div key={category.id}>
                <Text as="h3" variant="title-x-small">
                  {category.title}
                </Text>
                {shown.length === 0 ? (
                  <Text variant="body-small" color="secondary">
                    {query ? 'No match.' : 'None yet.'}
                  </Text>
                ) : (
                  <ul className={classes.list}>
                    {shown.map(doc => (
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
            );
          })}
        </Flex>
      </nav>
      <article aria-label={selected.title}>
        <KnowledgeDocument path={selected.path} />
      </article>
    </div>
  );
}
