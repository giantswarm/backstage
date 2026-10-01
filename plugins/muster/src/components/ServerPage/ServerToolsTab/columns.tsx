import { Link } from '@backstage/core-components';
import { Cell, ColumnConfig, SortDescriptor, Text } from '@backstage/ui';
import { ToolAnnotations } from '../../../apis';
import { isDestructive, isReadOnly } from '../../../lib/toolAnnotations';
import { ToolMarkers } from '../../shared';

/** A tool as its row shows it. */
export interface ToolRow {
  /** The tool's full name, the row id. */
  id: string;
  /** The name without the server's prefix, what the Tool column shows. */
  name: string;
  href?: string;
  annotations?: ToolAnnotations;
  description?: string;
}

/** What an Annotations sort orders by: destructive first, unmarked last. */
function annotationsRank({ annotations }: ToolRow): number {
  if (isDestructive({ annotations })) {
    return 0;
  }
  return isReadOnly({ annotations }) ? 1 : 2;
}

export function sortToolRows(rows: ToolRow[], sort: SortDescriptor): ToolRow[] {
  const sign = sort.direction === 'descending' ? -1 : 1;
  const compare = (a: ToolRow, b: ToolRow) => {
    switch (sort.column) {
      case 'annotations':
        return annotationsRank(a) - annotationsRank(b);
      case 'description':
        return (a.description ?? '').localeCompare(b.description ?? '');
      default:
        return a.name.localeCompare(b.name);
    }
  };
  // Ties stay in name order whichever way the column is sorted.
  return [...rows].sort(
    (a, b) =>
      sign * compare(a, b) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Tool · Annotations · Description. Most tools carry no annotations, so the
 * caller asks for the Annotations column only when one of its tools has one.
 */
export function toolColumns({
  annotations,
}: {
  annotations: boolean;
}): ColumnConfig<ToolRow>[] {
  const columns: ColumnConfig<ToolRow>[] = [
    {
      id: 'tool',
      label: 'Tool',
      isRowHeader: true,
      isSortable: true,
      defaultWidth: '2fr',
      minWidth: 240,
      // core-components' `Link`, as the servers table's: it reads as a link,
      // in the link colour.
      cell: row => (
        <Cell>
          {row.href ? (
            <Link to={row.href} title={row.name}>
              {row.name}
            </Link>
          ) : (
            <Text variant="body-medium">{row.name}</Text>
          )}
        </Cell>
      ),
    },
  ];
  if (annotations) {
    columns.push({
      id: 'annotations',
      label: 'Annotations',
      isSortable: true,
      defaultWidth: '1fr',
      minWidth: 140,
      cell: row => (
        <Cell>
          <ToolMarkers annotations={row.annotations} />
        </Cell>
      ),
    });
  }
  columns.push({
    id: 'description',
    label: 'Description',
    isSortable: true,
    defaultWidth: '5fr',
    minWidth: 240,
    cell: row => (
      <Cell>
        <Text
          variant="body-medium"
          color="secondary"
          truncate
          title={row.description}
          style={{ display: 'block' }}
        >
          {row.description ?? '—'}
        </Text>
      </Cell>
    ),
  });
  return columns;
}
