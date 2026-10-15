import { type ReactNode, useLayoutEffect, useState } from 'react';
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
import { ShellDocumentTitle, shellTitleParts } from '../ShellDocumentTitle';
import { useSimpleAccordionStyles } from '../SimpleAccordion';
import { useScrolledPast } from './useScrolledPast';

/**
 * CSS variable, set on the page's root: the room the page leaves under its
 * content (40px, 32px at phone width). Content docked to the view's bottom
 * edge with `position: sticky` — the session's chat bar — reads it to pull
 * itself into that room, so it rests at the same place at the end of the
 * scroll as it sticks at while scrolling, instead of lifting by the padding.
 */
export const SHELL_PAGE_PADDING_BOTTOM_VAR = '--shell-page-padding-bottom';

/**
 * CSS variable, set on the page's root while it has a compact header: that
 * bar's height. What the browser scrolls into view in the content — a
 * focused link, a fold-out opened from the keyboard — keeps this much
 * scroll margin, so it lands below the bar rather than under it.
 */
export const SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR =
  '--shell-page-compact-header-height';

/** The page's side gutter, in px. */
const GUTTER = 48;

/** The page's side gutter at phone width, in px. */
const PHONE_GUTTER = 16;

/** How long the compact header takes to fade in or out, in ms. */
const COMPACT_HEADER_FADE_MS = 150;

/**
 * The width, in px, the title's column claims beside the header's actions
 * before they move under it; `leading` comes on top. A long title wraps
 * beside the actions instead of pushing them down, so a session's pin and
 * menu stay at the top right even on a phone (192 + 16 + two 32px icon
 * buttons fit a 288px content column). A wider group — the Environment
 * select and a button — cannot leave a phone title that much, and wraps
 * under the title as a whole.
 */
const TITLE_MIN_WIDTH = 192;

/**
 * As {@link TITLE_MIN_WIDTH}, for a column that carries a description: a
 * sentence needs about 45 characters a line to read, where a title reads in
 * a few words. Narrower than this, the actions move under the description.
 */
const DESCRIPTION_MIN_WIDTH = 320;

const useStyles = makeStyles({
  root: {
    boxSizing: 'border-box',
    maxWidth: 1080,
    margin: '0 auto',
    [SHELL_PAGE_PADDING_BOTTOM_VAR]: '40px',
    padding: `28px ${GUTTER}px var(${SHELL_PAGE_PADDING_BOTTOM_VAR})`,
    // The shell's phone layout, the width at which its rail becomes the
    // bottom bar: phone gutters and the desktop rail never meet.
    [PHONE_MEDIA]: {
      [SHELL_PAGE_PADDING_BOTTOM_VAR]: '32px',
      padding: `20px ${PHONE_GUTTER}px var(${SHELL_PAGE_PADDING_BOTTOM_VAR})`,
    },
  },
  // Top-aligned: the leading avatar and the actions sit beside the title's
  // first line, however many lines the title and the rows under it take.
  // `leading`, the titles and the actions are one row of items, so the
  // titles' basis is the title's own room and `leading` comes on top of it.
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 20,
  },
  headerWithBreadcrumbs: {
    marginTop: 20,
  },
  leading: {
    flex: 'none',
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: `1 1 ${TITLE_MIN_WIDTH}px`,
    minWidth: 0,
  },
  titlesWithDescription: {
    flexBasis: DESCRIPTION_MIN_WIDTH,
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
  // Top-aligned, so a multi-line item (an inline error) leaves the buttons
  // beside the title. A row with a labelled field (the Environment select)
  // aligns on the bottom edge instead, so the field's box, not its label,
  // lines up with the buttons beside it. One gap between every control, as
  // across a wrapped row.
  actions: {
    display: 'flex',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    '&:has(.bui-FieldLabelWrapper)': {
      alignItems: 'flex-end',
    },
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
  // The compact header's anchor: sticky at the top of the view and of no
  // height, so the bar hangs over the content instead of taking room in the
  // flow — showing and hiding it moves nothing under it. Above the docked
  // composer (`zIndex: 1`), which the bar can meet on a short screen.
  compactHeaderAnchor: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    height: 0,
  },
  '@keyframes compactHeaderIn': {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  // One row: the title, the badges the page chose for the bar, and the
  // actions. Through the gutters to the page's edges, so the content scrolls
  // under a bar as wide as the page. Mounted the first time it shows, then
  // hidden with `visibility` rather than unmounted: its controls leave the
  // focus order and the accessibility tree, and a dialog opened from one of
  // them outlives a scroll.
  compactHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 16,
    marginInline: -GUTTER,
    paddingInline: GUTTER,
    paddingBlock: 8,
    backgroundColor: 'var(--bui-bg-app)',
    borderBottom: '1px solid var(--bui-border-1)',
    visibility: 'hidden',
    opacity: 0,
    // Fades out, then turns `visibility` off, so the bar is never focusable
    // while invisible. Fades in by an animation, which also runs when the
    // bar mounts already shown.
    transition: `opacity ${COMPACT_HEADER_FADE_MS}ms ease, visibility 0s linear ${COMPACT_HEADER_FADE_MS}ms`,
    '&[data-shown]': {
      visibility: 'visible',
      opacity: 1,
      transition: 'none',
      animation: `$compactHeaderIn ${COMPACT_HEADER_FADE_MS}ms ease`,
    },
    '@media (prefers-reduced-motion: reduce)': {
      '&, &[data-shown]': {
        transition: 'none',
        animation: 'none',
      },
    },
    [PHONE_MEDIA]: {
      marginInline: -PHONE_GUTTER,
      paddingInline: PHONE_GUTTER,
    },
  },
  // The title and the badges share the row while they fit; a title too long
  // for that takes the row and truncates, and the badges go under it.
  compactTitles: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 2,
    minWidth: 0,
  },
  compactTitle: {
    minWidth: 0,
    maxWidth: '100%',
    fontSize: 'var(--bui-font-size-4)',
    fontWeight: 500,
    lineHeight: 1.4,
    color: 'var(--bui-fg-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  compactBadges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
  },
  compactActions: {
    display: 'flex',
    alignItems: 'center',
    flex: 'none',
    gap: 8,
  },
  // What the browser scrolls into view lands below the compact header.
  bodyUnderCompactHeader: {
    '& :is(a, button, input, select, textarea, [tabindex])': {
      scrollMarginTop: `calc(var(${SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR}, 0px) + 8px)`,
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

/**
 * A compact copy of the page's header for {@link ShellPageProps.compactHeader}.
 */
export interface ShellPageCompactHeader {
  /**
   * The bar's title, in a smaller font and on one line. Defaults to the
   * page's `title`; give it when that is not plain text (the session's
   * rename button), so the bar does not repeat a control.
   */
  title?: ReactNode;
  /**
   * What the bar shows beside its title — what still matters while reading
   * the content, such as its state and owner — rather than the whole badge
   * row: the header is out of sight, not gone.
   */
  badges?: ReactNode;
}

export interface ShellPageProps {
  /** The page's h1. */
  title: ReactNode;
  /**
   * The document title's parts, most specific first; the suffix from
   * `ShellDocumentTitleProvider` follows. Defaults to the title when it is
   * text, or the current breadcrumb, then the breadcrumb above it. Give it
   * when the h1 is not text, e.g. the session's rename button.
   */
  documentTitle?: string | ReadonlyArray<string | undefined>;
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
  /** Holds a tab switch until the page agrees (see `RouteTabs`'s `onNavigate`). */
  onTabNavigate?: (href: string, navigate: () => void) => void;
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
  /**
   * For a long page that is read top to bottom, such as a conversation: once
   * everything above the content has scrolled out of view, a one-row bar
   * stays at the top of the view with a smaller title, these badges and the
   * header's actions; scrolling back up brings the full header back. The bar
   * hangs over the content rather than taking room, so it appearing moves
   * nothing. It renders the actions a second time, so an action that owns
   * state (a dialog) must keep it per instance or above the page.
   *
   * Not a heading: the h1 stays the page's only one.
   */
  compactHeader?: ShellPageCompactHeader;
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
 * Publishes the compact header's height on the page's root as
 * {@link SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR}. It is one row or two (a long
 * title puts the badges under it), so it is measured rather than assumed.
 * Without `ResizeObserver` (tests) it measures once.
 */
function useCompactHeaderHeight(
  root: HTMLElement | null,
  bar: HTMLElement | null,
): void {
  useLayoutEffect(() => {
    if (!root || !bar) {
      return undefined;
    }
    const measure = () => {
      root.style.setProperty(
        SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR,
        `${Math.ceil(bar.offsetHeight)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR);
    };
  }, [root, bar]);
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
 * stands aside, and sets the document title (`documentTitle`).
 */
export function ShellPage({
  title,
  documentTitle,
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
  onTabNavigate,
  aside,
  asideLabel = 'Details',
  footer,
  compactHeader,
  children,
}: ShellPageProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const slotActions = usePageHeaderActionsSlot();
  useOwnPageHeader();
  const hasBreadcrumbs = breadcrumbs !== undefined && breadcrumbs.length > 0;
  const hasActions = Boolean(actions || slotActions || menu);
  const titleParts = documentTitle ?? shellTitleParts(title, breadcrumbs);

  // Where the content starts: once it is above the view, so is everything
  // the full header shows.
  const [contentStart, setContentStart] = useState<HTMLElement | null>(null);
  const isCompactHeaderShown = useScrolledPast(
    compactHeader ? contentStart : null,
  );
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [compactBar, setCompactBar] = useState<HTMLElement | null>(null);
  useCompactHeaderHeight(root, compactBar);
  const compactTitle = compactHeader?.title ?? title;
  // Mounted the first time it shows (so a page read without scrolling holds
  // one copy of its header), then kept.
  const [isCompactHeaderMounted, setCompactHeaderMounted] = useState(false);
  if (isCompactHeaderShown && !isCompactHeaderMounted) {
    setCompactHeaderMounted(true);
  }

  return (
    <div ref={setRoot} className={classes.root}>
      {titleParts && <ShellDocumentTitle title={titleParts} />}
      {hasBreadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div
        className={`${classes.header} ${
          hasBreadcrumbs ? classes.headerWithBreadcrumbs : ''
        }`}
      >
        {leading && <div className={classes.leading}>{leading}</div>}
        <div
          className={`${classes.titles} ${
            description ? classes.titlesWithDescription : ''
          }`}
        >
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
            onNavigate={onTabNavigate}
          />
        </div>
      )}
      {compactHeader && (
        <>
          <div ref={setContentStart} aria-hidden />
          <div className={classes.compactHeaderAnchor}>
            {isCompactHeaderMounted && (
              <div
                ref={setCompactBar}
                className={classes.compactHeader}
                data-shown={isCompactHeaderShown ? '' : undefined}
                data-testid="shell-page-compact-header"
              >
                <div className={classes.compactTitles}>
                  <span
                    className={classes.compactTitle}
                    title={
                      typeof compactTitle === 'string'
                        ? compactTitle
                        : undefined
                    }
                  >
                    {compactTitle}
                  </span>
                  {compactHeader.badges && (
                    <div className={classes.compactBadges}>
                      {compactHeader.badges}
                    </div>
                  )}
                </div>
                {hasActions && (
                  <div className={classes.compactActions}>
                    {actions}
                    {slotActions}
                    {menu}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <div
        className={`${classes.body} ${
          compactHeader ? classes.bodyUnderCompactHeader : ''
        }`}
      >
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
