import { ReactNode } from 'react';
import { Badge, ButtonLink, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  isPortalPath,
  MagazineLink,
  Progress,
  progressLabel,
  progressPercent,
  StatusTone,
  statusTone,
} from '../../lib/magazine';

const useStyles = makeStyles({
  chip: {
    display: 'inline-block',
    padding: '0 var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    fontSize: 'var(--bui-font-size-2, 0.75rem)',
    lineHeight: 1.7,
    whiteSpace: 'nowrap',
    border: '1px solid var(--bui-border-1)',
    backgroundColor: 'var(--bui-bg-neutral-2)',
    color: 'var(--bui-fg-primary)',
  },
  // The accent: blockers and review requests only.
  warning: {
    borderColor: 'var(--bui-warning-border)',
    color: 'var(--bui-warning-fg-subdued)',
    backgroundColor: 'var(--bui-warning-bg-subdued)',
  },
  neutral: {},
  track: {
    flex: '0 0 96px',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'var(--bui-bg-neutral-3)',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: 'var(--bui-fg-secondary)',
  },
  callout: {
    borderLeft: '3px solid var(--bui-warning-border)',
    backgroundColor: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
    borderRadius: 'var(--bui-radius-2)',
    padding: 'var(--bui-space-2) var(--bui-space-3)',
  },
});

/** A status word in its tone; the accent only for blocked and review. */
export function StatusChip(props: { label: string; tone?: StatusTone }) {
  const classes = useStyles();
  const tone = props.tone ?? statusTone(props.label);
  if (tone === 'warning' || tone === 'neutral') {
    return (
      <span className={`${classes.chip} ${classes[tone]}`}>{props.label}</span>
    );
  }
  // Progress states: the status colour on the text, no fill.
  return (
    <span className={classes.chip}>
      <Text variant="body-small" color={tone}>
        {props.label}
      </Text>
    </span>
  );
}

/** "n of m done" with a small bar, labelled for screen readers. */
export function ProgressLine(props: { progress: Progress; label?: string }) {
  const classes = useStyles();
  const { progress } = props;
  const label = props.label ?? progressLabel(progress);
  return (
    <Flex align="center" gap="2">
      <div
        className={classes.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={Math.min(progress.done, progress.total)}
      >
        <div
          className={classes.bar}
          style={{ width: `${progressPercent(progress)}%` }}
        />
      </div>
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
    </Flex>
  );
}

export function CustomerTags(props: { customers: string[] }) {
  if (props.customers.length === 0) {
    return null;
  }
  return (
    <Flex gap="1" align="center" style={{ flexWrap: 'wrap' }}>
      {props.customers.map(customer => (
        <Badge key={customer} size="small">
          {customer}
        </Badge>
      ))}
    </Flex>
  );
}

/** A highlighted note: what blocks, who owns it, since when. */
export function Callout(props: { title: string; children?: ReactNode }) {
  const classes = useStyles();
  return (
    <div className={classes.callout} role="note" aria-label={props.title}>
      <Text variant="body-small" weight="bold">
        {props.title}
      </Text>
      {props.children && (
        <Text as="div" variant="body-small">
          {props.children}
        </Text>
      )}
    </div>
  );
}

/**
 * A magazine link: a portal path ("/roadmap/…") is routed in-app, anything
 * else opens GitHub or the target site in a new tab.
 */
export function MagazineLinkItem(props: {
  link: MagazineLink;
  variant?: 'text' | 'button';
}) {
  const { link, variant = 'text' } = props;
  const external = !isPortalPath(link.url);
  const target = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
  if (variant === 'button') {
    return (
      <ButtonLink href={link.url} size="small" variant="secondary" {...target}>
        {link.label}
      </ButtonLink>
    );
  }
  return (
    <Link href={link.url} variant="body-small" {...target}>
      {link.label}
    </Link>
  );
}

/** Links in the fixed order the card anatomy uses, with the "Try it" last. */
export function LinkRow(props: {
  links: MagazineLink[];
  tryIt?: MagazineLink;
}) {
  const { links, tryIt } = props;
  if (links.length === 0 && !tryIt) {
    return null;
  }
  return (
    <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
      {links.map(link => (
        <MagazineLinkItem key={`${link.label}:${link.url}`} link={link} />
      ))}
      {tryIt && <MagazineLinkItem link={tryIt} variant="button" />}
    </Flex>
  );
}

const useSectionStyles = makeStyles({
  section: {
    marginBottom: 'var(--bui-space-6)',
  },
  accent: {
    borderLeft: '3px solid var(--bui-warning-border)',
    paddingLeft: 'var(--bui-space-3)',
  },
  grid: {
    display: 'grid',
    gap: 'var(--bui-space-3)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    alignItems: 'start',
  },
  list: {
    margin: 0,
    paddingLeft: 'var(--bui-space-5)',
  },
});

/**
 * A titled block of the magazine: heading, one-line digest, then content.
 * `accent` marks the blocks that need the reader (review, blocked).
 */
export function MagazineSection(props: {
  id: string;
  title: string;
  summary?: string;
  accent?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const classes = useSectionStyles();
  const headingId = `magazine-${props.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`${classes.section} ${props.accent ? classes.accent : ''}`}
    >
      <Flex justify="between" align="center" gap="2">
        <Text as="h3" variant="title-small" id={headingId}>
          {props.title}
        </Text>
        {props.actions}
      </Flex>
      {props.summary && (
        <Text as="p" variant="body-medium" color="secondary">
          {props.summary}
        </Text>
      )}
      <div style={{ marginTop: 'var(--bui-space-3)' }}>{props.children}</div>
    </section>
  );
}

/** Cards side by side, as many columns as fit. */
export function CardGrid(props: { children: ReactNode }) {
  const classes = useSectionStyles();
  return <div className={classes.grid}>{props.children}</div>;
}

/** The 2-3 line digest that opens every view. */
export function SummaryLines(props: { lines: string[] }) {
  const classes = useSectionStyles();
  if (props.lines.length === 0) {
    return null;
  }
  return (
    <ul className={classes.list} aria-label="Summary">
      {props.lines.map(line => (
        <li key={line}>
          <Text variant="body-large">{line}</Text>
        </li>
      ))}
    </ul>
  );
}
