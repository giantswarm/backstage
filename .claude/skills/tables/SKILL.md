---
name: tables
description: Patterns for implementing tables using '@backstage/core-components' Table, including column definitions, sorting, filtering, and visibility persistence.
---

## Table Structure

### File Organization

- Table components are organized in dedicated directories (e.g., `DeploymentsTable/`, `ClustersTable/`)
- Separate column definitions into a `columns.tsx` file
- Export a `getInitialColumns` function that accepts `visibleColumns` and returns `TableColumn<T>[]`
- Define column field names as a const object (e.g., `DeploymentColumns`, `ClusterColumns`)

### Table Component Pattern

```tsx
import { Table, TableColumn } from '@backstage/core-components';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';

// Use generic Table component with typed data
<Table<YourDataType>
  isLoading={loading}
  options={{
    pageSize: 50,
    pageSizeOptions: [10, 25, 50, 100],
    emptyRowsWhenPaging: false,
    columnsButton: true, // Enable column visibility toggle
  }}
  data={data}
  columns={columns}
  style={{ width: '100%' }}
  title={<Typography variant="h6">Title ({data.length})</Typography>}
/>;
```

## Column Definitions

### Required Imports

```tsx
import {
  isTableColumnHidden,
  semverCompareSort,
  sortAndFilterOptions,
} from '@giantswarm/backstage-plugin-ui-react';
```

### Column Visibility Persistence

- Use `useTableColumns(TABLE_ID)` hook to persist column visibility in localStorage
- Apply visibility with `isTableColumnHidden()` when generating columns:

```tsx
return columns.map(column => ({
  ...column,
  hidden: isTableColumnHidden(column.field, {
    defaultValue: Boolean(column.hidden),
    visibleColumns,
    queryParameters, // Optional: show columns if they have query params
  }),
}));
```

## Sorting & Filtering

### Semver Data

- Use `customSort: semverCompareSort(row => row.version)` for version columns

### Custom String Sorting/Filtering

- Use `sortAndFilterOptions(row => row.fieldValue)` to add both `customSort` and `customFilterAndSearch`
- Useful when the display value differs from the data value:

```tsx
{
  title: 'Source',
  field: 'source',
  render: row => formatSource(row.sourceKind, row.sourceName),
  ...sortAndFilterOptions(row => `${row.sourceKind} ${row.sourceName}`),
}
```

### DateTime Columns

- Set `type: 'datetime'` for automatic date sorting
- Use `<DateComponent value={row.date} relative />` for rendering

## Common Patterns

### Link Columns with Route Refs

```tsx
render: row => {
  const LinkWrapper = () => {
    const routeLink = useRouteRef(detailsRouteRef);
    return (
      <Link component={RouterLink} to={routeLink({ id: row.id })}>
        <Typography variant="inherit" noWrap>{row.name}</Typography>
      </Link>
    );
  };
  return <LinkWrapper />;
},
```

### Columns with Subvalues

```tsx
import { SubvalueCell } from '@backstage/core-components';

render: row => (
  <SubvalueCell value={<MainContent />} subvalue={row.description} />
),
```

### Hidden by Default Columns

- Set `hidden: true` on columns that should be hidden by default
- Users can toggle visibility via the columns button

### Refresh Action

```tsx
actions={[
  {
    icon: () => <SyncIcon />,
    tooltip: 'Reload data',
    isFreeAction: true,
    onClick: () => retry(),
  },
]}
```

### Not Available State

- Use `<NotAvailable />` component when data is missing
