import {
  type FocusEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import { useScrolledPast } from '../../hooks/useScrolledPast';

/**
 * CSS variable, set on the page's root: the room the page leaves under its
 * content (40px, 32px at phone width). Content docked to the view's bottom
 * edge with `position: sticky` — the session's chat bar — reads it to pull
 * itself into that room, so it rests at the same place at the end of the
 * scroll as it sticks at while scrolling, instead of lifting by the padding.
 */
export const SHELL_PAGE_PADDING_BOTTOM_VAR = '--shell-page-padding-bottom';

/**
 * CSS variable, set on the document root while a page's header is compact
 * (see {@link ShellPageProps.compactHeader}): that header's height. The
 * document's `scroll-padding-top` reads it, so whatever the browser scrolls
 * into view lands below the header rather than under it.
 */
export const SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR =
  '--shell-page-compact-header-height';

/** The page's side gutter, in px. */
const GUTTER = 48;

/** The page's side gutter at phone width, in px. */
const PHONE_GUTTER = 16;

/** How long the compact header takes to fade in, in ms. */
const COMPACT_HEADER_FADE_MS = 150;

/** Marks a part of the header that the compact header leaves out. */
const EXPANDED_ONLY_ATTRIBUTE = 'data-shell-page-expanded-only';

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
  '@keyframes compactHeaderIn': {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  // The same header, once everything above the content has scrolled out of
  // view: one row at the top of the view, stuck there by `sticky` against the
  // page's root. Its title, badges and actions are the expanded header's own
  // elements — nothing is mounted twice — restyled: a 16px title on one line,
  // without the leading mark, the description, the meta text and the parts
  // the page marks `ShellPageExpandedOnly`. The height it gives up stays in
  // the flow as the spacer after it (`useCompactHeaderLayout`), so the
  // content does not move. Through the gutters to the page's edges, so the
  // content scrolls under a bar as wide as the page; above the docked
  // composer (`zIndex: 1`), which it can meet on a short screen.
  headerCompact: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginInline: -GUTTER,
    paddingInline: GUTTER,
    paddingBlock: 8,
    backgroundColor: 'var(--bui-bg-app)',
    borderBottom: '1px solid var(--bui-border-1)',
    animation: `$compactHeaderIn ${COMPACT_HEADER_FADE_MS}ms ease`,
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
    [`& $leading, & $description, & $meta, & [${EXPANDED_ONLY_ATTRIBUTE}="always"]`]:
      {
        display: 'none',
      },
    [PHONE_MEDIA]: {
      marginInline: -PHONE_GUTTER,
      paddingInline: PHONE_GUTTER,
      [`& [${EXPANDED_ONLY_ATTRIBUTE}]`]: {
        display: 'none',
      },
    },
    // The title and the badges share the row while they fit; a title too
    // long for that takes the row and truncates, and the badges go under it.
    '& $titles': {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 12,
      rowGap: 2,
      flexBasis: 0,
    },
    '& $title': {
      maxWidth: '100%',
      fontSize: 'var(--bui-font-size-4)',
      lineHeight: 1.4,
      letterSpacing: 'normal',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    // A title that is a control (the session's rename button) truncates too.
    '& $title > *': {
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      verticalAlign: 'top',
    },
    '& $badges': {
      minWidth: 0,
    },
    '& $actions': {
      alignItems: 'center',
      flex: 'none',
    },
  },
  // Where the content starts, for `useScrolledPast`: a box that reaches from
  // there far up past the top of the document, so it intersects the view
  // whenever the view is above the content's start, however it got there.
  contentStart: {
    position: 'relative',
    height: 0,
  },
  contentStartSentinel: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 1,
    height: 100000,
    pointerEvents: 'none',
  },
  expandedOnly: {
    display: 'contents',
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
  meta: {},
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
   * everything above the content has scrolled out of view, the header turns
   * into one compact row that stays at the top of the view — a smaller
   * title, the badges, the actions — and scrolling back up restores it. It
   * is the same header, so its h1 and actions stay mounted once; the room it
   * gives up stays in the flow, so the content does not move. Wrap what the
   * compact row leaves out (where, since when) in `ShellPageExpandedOnly`.
   */
  compactHeader?: boolean;
  children?: ReactNode;
}

/**
 * A part of the header's badge row that the compact header leaves out — at
 * every width, or with `onlyAtPhoneWidth` only at phone width, where the row
 * has the least room. See {@link ShellPageProps.compactHeader}.
 */
export function ShellPageExpandedOnly({
  onlyAtPhoneWidth = false,
  children,
}: {
  onlyAtPhoneWidth?: boolean;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <span
      className={classes.expandedOnly}
      {...{ [EXPANDED_ONLY_ATTRIBUTE]: onlyAtPhoneWidth ? 'phone' : 'always' }}
    >
      {children}
    </span>
  );
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

/** Whether `element` sits in a part the compact header leaves out. */
function isExpandedOnly(element: Element, isPhone: boolean): boolean {
  const part = element.closest(`[${EXPANDED_ONLY_ATTRIBUTE}]`);
  if (!part) {
    return false;
  }
  return isPhone || part.getAttribute(EXPANDED_ONLY_ATTRIBUTE) === 'always';
}

/**
 * Keeps the content in place while the header is compact, and the compact
 * header clear of what the browser scrolls into view.
 *
 * Expanded, it remembers the header's height. Compact, it gives the spacer
 * after the header the difference, so the header and the spacer take the
 * room the expanded header took. It runs before paint, so the content never
 * shows moved. The compact height goes on the document root as
 * {@link SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR}, which the document's
 * `scroll-padding-top` reads while the page opts in: a focused control, a
 * fold-out scrolling itself into view and an anchor all land below the
 * compact header. Without `ResizeObserver` (tests) it measures once per mode.
 */
function useCompactHeaderLayout(
  header: HTMLElement | null,
  spacer: HTMLElement | null,
  isCompact: boolean,
): void {
  const expandedHeight = useRef(0);
  useLayoutEffect(() => {
    if (!header || !spacer) {
      return undefined;
    }
    const root = document.documentElement;
    const measure = () => {
      const height = header.offsetHeight;
      if (!isCompact) {
        expandedHeight.current = height;
        spacer.style.height = '0px';
        return;
      }
      spacer.style.height = `${Math.max(0, expandedHeight.current - height)}px`;
      root.style.setProperty(
        SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR,
        `${Math.ceil(height)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(header);
    return () => observer?.disconnect();
  }, [header, spacer, isCompact]);

  useLayoutEffect(() => {
    if (!spacer) {
      return undefined;
    }
    const root = document.documentElement;
    root.style.scrollPaddingTop = `calc(var(${SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR}, 0px) + 8px)`;
    return () => {
      root.style.removeProperty('scroll-padding-top');
      root.style.removeProperty(SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR);
    };
  }, [spacer]);
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
  compactHeader = false,
  children,
}: ShellPageProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const slotActions = usePageHeaderActionsSlot();
  useOwnPageHeader();
  const hasBreadcrumbs = breadcrumbs !== undefined && breadcrumbs.length > 0;
  const hasActions = Boolean(actions || slotActions || menu);
  const titleParts = documentTitle ?? shellTitleParts(title, breadcrumbs);

  // Compact once the content's start is above the view — unless focus is on
  // a part the compact header leaves out, which would drop it to the body.
  // The sentinel and the spacer exist only on a page that opts in.
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const [spacer, setSpacer] = useState<HTMLElement | null>(null);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const isPastHeader = useScrolledPast(sentinel);
  const [isFocusExpandedOnly, setFocusExpandedOnly] = useState(false);
  const isCompact = compactHeader && isPastHeader && !isFocusExpandedOnly;
  useCompactHeaderLayout(header, spacer, isCompact);
  const onHeaderFocus = compactHeader
    ? (event: FocusEvent<HTMLElement>) =>
        setFocusExpandedOnly(isExpandedOnly(event.target, isPhone))
    : undefined;
  const onHeaderBlur = compactHeader
    ? (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusExpandedOnly(false);
        }
      }
    : undefined;

  return (
    <div className={classes.root}>
      {titleParts && <ShellDocumentTitle title={titleParts} />}
      {hasBreadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div
        ref={compactHeader ? setHeader : undefined}
        className={`${classes.header} ${
          hasBreadcrumbs ? classes.headerWithBreadcrumbs : ''
        } ${isCompact ? classes.headerCompact : ''}`}
        data-compact={isCompact ? '' : undefined}
        data-testid={compactHeader ? 'shell-page-header' : undefined}
        onFocus={onHeaderFocus}
        onBlur={onHeaderBlur}
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
                <Text
                  variant="body-small"
                  color="secondary"
                  className={classes.meta}
                >
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
      {compactHeader && <div ref={setSpacer} aria-hidden />}
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
        <div className={classes.contentStart} aria-hidden>
          <div ref={setSentinel} className={classes.contentStartSentinel} />
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
