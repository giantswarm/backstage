import type { ReactNode } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { BreadcrumbItem, Breadcrumbs } from '../Breadcrumbs';
import {
  useOwnPageHeader,
  usePageHeaderActionsSlot,
} from '../PageHeaderActions';
import { RouteTabs, RouteTabSpec } from '../RouteTabs';

const NARROW_BREAKPOINT = 600;

const useStyles = makeStyles({
  root: {
    boxSizing: 'border-box',
    maxWidth: 1080,
    margin: '0 auto',
    padding: '28px 48px 40px',
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      padding: '20px 16px 32px',
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
  },
  headerWithBreadcrumbs: {
    marginTop: 20,
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    minWidth: 0,
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 500,
    lineHeight: 1.25,
    letterSpacing: '-0.3px',
    color: 'var(--bui-fg-primary)',
    overflowWrap: 'anywhere',
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  description: {
    margin: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabs: {
    marginTop: 24,
    borderBottom: '1px solid var(--bui-border-1)',
  },
  body: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 48,
    marginTop: 20,
  },
  main: {
    flex: '999 1 480px',
    minWidth: 0,
  },
  aside: {
    flex: '1 1 260px',
    maxWidth: 300,
    minWidth: 0,
    [`@media (max-width: ${NARROW_BREAKPOINT}px)`]: {
      maxWidth: 'none',
    },
  },
  footer: {
    marginTop: 32,
  },
});

export interface ShellPageProps {
  /** The page's h1. */
  title: ReactNode;
  /** Ancestors of the page above the title, the current page last. */
  breadcrumbs?: BreadcrumbItem[];
  /** Before the title, e.g. the resource's icon tile or avatar. */
  leading?: ReactNode;
  /** A row under the title: state and scope badges. */
  badges?: ReactNode;
  /** Muted text at the end of the badge row, e.g. a one-line summary. */
  meta?: ReactNode;
  /** A paragraph under the title. */
  description?: ReactNode;
  /**
   * The page's own actions, at the right of the header. Actions that routed
   * content registers with `useProvidePageHeaderActions` render after them.
   */
  actions?: ReactNode;
  /** The overflow menu, last in the header, e.g. a "More actions" button. */
  menu?: ReactNode;
  /** Routed tabs under the header, drawn as an underlined strip. */
  tabs?: RouteTabSpec[];
  /** The query string every tab link keeps, e.g. `?installation=gazelle`. */
  tabsSearch?: string;
  /** A narrow column beside the content, e.g. a `FactsColumn`. */
  aside?: ReactNode;
  /** Below the content and the aside. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The agent-platform shell's page frame: breadcrumbs, a title row with
 * badges and actions, optional routed tabs, and the content with an optional
 * column beside it.
 *
 * It renders the page-header-actions slot but mounts no
 * `PageHeaderActionsProvider`: the route that renders the page provides it,
 * so the actions of everything below the route land in this header. It also
 * claims the page header (`useOwnPageHeader`), so a layout header above it
 * stands aside.
 */
export function ShellPage({
  title,
  breadcrumbs,
  leading,
  badges,
  meta,
  description,
  actions,
  menu,
  tabs,
  tabsSearch,
  aside,
  footer,
  children,
}: ShellPageProps) {
  const classes = useStyles();
  const slotActions = usePageHeaderActionsSlot();
  useOwnPageHeader();
  const hasBreadcrumbs = breadcrumbs !== undefined && breadcrumbs.length > 0;
  const hasActions = Boolean(actions || slotActions || menu);

  return (
    <div className={classes.root}>
      {hasBreadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div
        className={`${classes.header} ${
          hasBreadcrumbs ? classes.headerWithBreadcrumbs : ''
        }`}
      >
        <div className={classes.identity}>
          {leading}
          <div className={classes.titles}>
            <h1 className={classes.title}>{title}</h1>
            {(badges || meta) && (
              <div className={classes.badges}>
                {badges}
                {meta && (
                  <Text variant="body-small" color="secondary">
                    {meta}
                  </Text>
                )}
              </div>
            )}
            {description && (
              <Text
                as="p"
                variant="body-medium"
                color="secondary"
                className={classes.description}
              >
                {description}
              </Text>
            )}
          </div>
        </div>
        {hasActions && (
          <div className={classes.actions}>
            {actions}
            {slotActions}
            {menu}
          </div>
        )}
      </div>
      {tabs && tabs.length > 0 && (
        <div className={classes.tabs}>
          <RouteTabs tabs={tabs} search={tabsSearch} />
        </div>
      )}
      <div className={classes.body}>
        <div className={classes.main}>{children}</div>
        {aside && <div className={classes.aside}>{aside}</div>}
      </div>
      {footer && <div className={classes.footer}>{footer}</div>}
    </div>
  );
}
