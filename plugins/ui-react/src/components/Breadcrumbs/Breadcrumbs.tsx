import { CSSProperties } from 'react';
import { Link, Text } from '@backstage/ui';

export interface BreadcrumbItem {
  label: string;
  /** Absent for the current page, which is the last item. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--bui-space-1)',
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

/**
 * Where a page sits in its section, above the page title: every ancestor a
 * link, the current page last and plain. bui ships no breadcrumb, and the
 * core-components one is MUI.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb">
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
