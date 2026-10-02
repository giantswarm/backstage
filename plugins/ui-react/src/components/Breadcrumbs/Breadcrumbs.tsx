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

const itemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--bui-space-1)',
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
                <Link href={item.href} variant="body-small">
                  {item.label}
                </Link>
              ) : (
                <Text
                  variant="body-small"
                  color="secondary"
                  aria-current={last ? 'page' : undefined}
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
