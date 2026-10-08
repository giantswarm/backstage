import type { ReactElement } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BreadcrumbEntry } from '@backstage/frontend-plugin-api';
import { ButtonLink, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';

export type AgentPlatformSubPage = {
  path: string;
  title?: string;
  element: ReactElement;
};

type ShellPageHeader = {
  description?: string;
  action?: { label: string; href: string };
};

const SHELL_PAGE_HEADERS: Record<string, ShellPageHeader> = {
  sessions: {
    description: "Every conversation you've had with an agent.",
    action: { label: 'New session', href: '/' },
  },
};

const useStyles = makeStyles(theme => ({
  header: {
    padding: theme.spacing(5, 3, 0),
  },
}));

function SubPageHeader({ title, path }: { title: string; path: string }) {
  const classes = useStyles();
  const { description, action } = SHELL_PAGE_HEADERS[path] ?? {};
  return (
    <Flex justify="between" align="start" gap="4" className={classes.header}>
      <Flex direction="column" gap="1">
        <Text as="h1" variant="title-medium">
          {title}
        </Text>
        {description && (
          <Text variant="body-medium" color="secondary">
            {description}
          </Text>
        )}
      </Flex>
      {action && (
        <ButtonLink
          href={action.href}
          variant="primary"
          iconStart={<AddIcon />}
        >
          {action.label}
        </ButtonLink>
      )}
    </Flex>
  );
}

/**
 * The page's sub-pages routed the way `PageBlueprint` routes its tabs, for the
 * page rendered without its tab strip: a bare path lands on the first one, and
 * each names itself in the document title as its tab would and heads its
 * content with its own title.
 */
export function AgentPlatformPageRoutes({
  pageTitle,
  pages,
}: {
  pageTitle: string;
  pages: AgentPlatformSubPage[];
}) {
  const firstPath = pages[0]?.path;
  return (
    <Routes>
      {firstPath && (
        <Route index element={<Navigate to={firstPath} replace />} />
      )}
      {pages.map(page => {
        const label = page.title || page.path;
        return (
          <Route
            key={page.path}
            path={`${page.path}/*`}
            element={
              <BreadcrumbEntry entry={{ label, href: page.path }}>
                <Helmet title={`${label} · ${pageTitle}`} />
                <SubPageHeader title={label} path={page.path} />
                {page.element}
              </BreadcrumbEntry>
            }
          />
        );
      })}
    </Routes>
  );
}
