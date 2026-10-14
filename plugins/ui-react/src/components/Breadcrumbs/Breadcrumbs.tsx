import { CSSProperties } from 'react';
import { Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { PHONE_MEDIA } from '../../utils/breakpoints';

export interface BreadcrumbItem {
  label: string;
  /** Absent for the current page, which is the last item. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

// The back arrow sits before the trail, aligned with its first line when a
// long trail wraps at phone width.
const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--bui-space-2)',
  minWidth: 0,
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--bui-space-1)',
  flex: '1 1 auto',
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

// `minWidth: 0` on the item and `overflowWrap` on its label: a long
// snake_case crumb (a tool, a workflow) breaks inside the 343px a phone
// leaves, instead of pushing the page sideways.
const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bui-space-1)',
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const useStyles = makeStyles({
  // The icon-only link idiom of `WizardFrame`'s Close, sized to the
  // breadcrumb row: the negative block margin keeps the 24px target from
  // making the row taller than its text, so a page's title does not move
  // with the arrow's presence.
  back: {
    width: 24,
    height: 24,
    margin: '-4px 0',
    flex: 'none',
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--bui-fg-secondary)',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      color: 'var(--bui-fg-primary)',
    },
    '& svg': { width: 16, height: 16 },
    // A thumb's target (C25), pulled back by the extra on every side so the
    // arrow and the trail keep their places.
    [PHONE_MEDIA]: {
      width: 44,
      height: 44,
      margin: '-14px -10px',
    },
  },
});

/**
 * The page the back arrow leads to: the nearest ancestor with an href. The
 * last item is the current page, never a target.
 */
function parentOf(items: BreadcrumbItem[]): Required<BreadcrumbItem> | null {
  for (let index = items.length - 2; index >= 0; index--) {
    const { label, href } = items[index];
    if (href) {
      return { label, href };
    }
  }
  return null;
}

/**
 * Where a page sits in its section, above the page title: a back arrow to
 * the nearest linked ancestor, then every ancestor a link, the current page
 * last and plain. bui ships no breadcrumb, and the core-components one is
 * MUI.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const classes = useStyles();
  const parent = parentOf(items);
  return (
    <nav aria-label="Breadcrumb" style={navStyle}>
      {parent && (
        <Link
          href={parent.href}
          aria-label={`Back to ${parent.label}`}
          className={classes.back}
        >
          <ArrowBackIcon />
        </Link>
      )}
      <ol style={listStyle}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} style={itemStyle}>
              {item.href && !last ? (
                <Link href={item.href} variant="body-small" style={labelStyle}>
                  {item.label}
                </Link>
              ) : (
                <Text
                  variant="body-small"
                  color="secondary"
                  aria-current={last ? 'page' : undefined}
                  style={labelStyle}
                >
                  {item.label}
                </Text>
              )}
              {!last && (
                <Text variant="body-small" color="secondary" aria-hidden>
                  /
                </Text>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
