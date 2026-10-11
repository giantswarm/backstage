import { type ReactNode, useState } from 'react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Skeleton,
  Text,
  VisuallyHidden,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { PHONE_MEDIA, usePhoneLayout } from '../../utils/breakpoints';
import { BreadcrumbItem, Breadcrumbs } from '../Breadcrumbs';
import {
  useOwnPageHeader,
  usePageHeaderActionsSlot,
} from '../PageHeaderActions';
import { RouteTabs, RouteTabSpec } from '../RouteTabs';
import { useSimpleAccordionStyles } from '../SimpleAccordion';

/**
 * CSS variable, set on the page's root: the room the page leaves under its
 * content (40px, 32px at phone width). Content docked to the view's bottom
 * edge with `position: sticky` — the session's chat bar — reads it to pull
 * itself into that room, so it rests at the same place at the end of the
 * scroll as it sticks at while scrolling, instead of lifting by the padding.
 */
export const SHELL_PAGE_PADDING_BOTTOM_VAR = '--shell-page-padding-bottom';

/** The page's side gutter at phone width, in px. */
const PHONE_GUTTER = 16;

const useStyles = makeStyles({
  root: {
    boxSizing: 'border-box',
    maxWidth: 1080,
    margin: '0 auto',
    [SHELL_PAGE_PADDING_BOTTOM_VAR]: '40px',
    padding: `28px 48px var(${SHELL_PAGE_PADDING_BOTTOM_VAR})`,
    // The shell's phone layout, the width at which its rail becomes the
    // bottom bar: phone gutters and the desktop rail never meet.
    [PHONE_MEDIA]: {
      [SHELL_PAGE_PADDING_BOTTOM_VAR]: '32px',
      padding: `20px ${PHONE_GUTTER}px var(${SHELL_PAGE_PADDING_BOTTOM_VAR})`,
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
  // At phone width the strip scrolls (see `RouteTabs`): it reaches through
  // the gutter to the screen's edges, so tabs scroll out of sight there rather
  // than at the content's edge, and rests aligned with the content.
  tabStrip: {
    [PHONE_MEDIA]: {
      marginInline: -PHONE_GUTTER,
      paddingInline: PHONE_GUTTER,
    },
  },
  body: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 48,
    marginTop: 20,
    // Stacked, the fold-out sits close above the content it belongs to.
    [PHONE_MEDIA]: {
      rowGap: 20,
    },
  },
  main: {
    flex: '999 1 480px',
    minWidth: 0,
  },
  aside: {
    flex: '1 1 260px',
    maxWidth: 300,
    minWidth: 0,
    [PHONE_MEDIA]: {
      maxWidth: 'none',
    },
  },
  // The aside at phone width: first, folded, and as wide as the content.
  // Outlined like the shell's other fold-outs ("Technical details").
  asideFoldOut: {
    flex: '1 1 100%',
    minWidth: 0,
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
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
  /**
   * Routed tabs under the header, drawn as an underlined strip; at phone
   * width one row that scrolls sideways, edge to edge (see `RouteTabs`).
   */
  tabs?: RouteTabSpec[];
  /** The query string every tab link keeps, e.g. `?installation=gazelle`. */
  tabsSearch?: string;
  /** The tab hrefs' base, when not the splat route's (see `RouteTabs`). */
  tabsBasePath?: string;
  /**
   * A narrow column beside the content, e.g. a `FactsColumn`. At phone
   * width it comes first instead, folded under {@link ShellPageProps.asideLabel},
   * so it is not left behind hundreds of rows of the content.
   */
  aside?: ReactNode;
  /** The aside's fold-out heading at phone width. Defaults to "Details". */
  asideLabel?: string;
  /** Below the content and the aside. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The title while the page's name is still being read: a skeleton on the
 * h1's own line box (`1.25em` of its font is its line height), so the header
 * is already in its final geometry and the name fills in where it will stay.
 * Pass it as `title`; `label` is the heading's accessible name meanwhile,
 * e.g. "Loading agent".
 *
 * A detail page's loading state renders the same `ShellPage` as its loaded
 * state — breadcrumbs, `leading`, `tabs` — with this and
 * {@link ShellPageBadgeSkeleton} in place of what is not known yet, never a
 * bare frame the data then rearranges.
 */
export function ShellPageTitleSkeleton({ label }: { label: string }) {
  return (
    <>
      <Skeleton
        width={240}
        height="1.25em"
        style={{
          display: 'inline-block',
          verticalAlign: 'top',
          maxWidth: '100%',
        }}
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </>
  );
}

/**
 * A state badge's skeleton for `badges`, while the page's state is still
 * being read: one line of the badge row, so the row is there from the first
 * paint.
 */
export function ShellPageBadgeSkeleton() {
  return <Skeleton width={96} height={20} rounded />;
}

/**
 * The `aside` while its facts are still being read: a `FactsColumn`'s
 * caption-over-value pairs as skeletons, so the content beside it has its
 * final width from the first paint.
 */
export function ShellPageFactsSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bui-space-4)',
      }}
    >
      {[0, 1, 2].map(index => (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bui-space-1)',
          }}
        >
          <Skeleton width="40%" height={14} />
          <Skeleton width="80%" height={20} />
        </div>
      ))}
    </div>
  );
}

/**
 * The aside at phone width: above the content and folded. A facts column
 * wrapped after a tab of hundreds of tools or a whole workflow is a column
 * nobody reaches. Controlled, so the aside mounts only while open — bui's
 * panel otherwise stays mounted, merely hidden.
 */
function AsideFoldOut({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const classes = useStyles();
  const spacing = useSimpleAccordionStyles();
  const [isExpanded, setExpanded] = useState(false);
  return (
    <Accordion
      className={`${classes.asideFoldOut} ${spacing.group}`}
      isExpanded={isExpanded}
      onExpandedChange={setExpanded}
    >
      <AccordionTrigger level={2}>{label}</AccordionTrigger>
      <AccordionPanel>{isExpanded ? children : null}</AccordionPanel>
    </Accordion>
  );
}

/**
 * The agent-platform shell's page frame: breadcrumbs, a title row with
 * badges and actions, optional routed tabs, and the content with an optional
 * column beside it — above it, folded, at phone width.
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
  tabsBasePath,
  aside,
  asideLabel = 'Details',
  footer,
  children,
}: ShellPageProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
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
          <RouteTabs
            tabs={tabs}
            search={tabsSearch}
            basePath={tabsBasePath}
            className={classes.tabStrip}
          />
        </div>
      )}
      <div className={classes.body}>
        {aside && isPhone && (
          <AsideFoldOut label={asideLabel}>{aside}</AsideFoldOut>
        )}
        <div className={classes.main}>{children}</div>
        {aside && !isPhone && <div className={classes.aside}>{aside}</div>}
      </div>
      {footer && <div className={classes.footer}>{footer}</div>}
    </div>
  );
}
