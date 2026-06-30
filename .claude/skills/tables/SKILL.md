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

### Gotcha: search matches the raw `field` value, not the rendered label

The built-in quick-search ignores `render` and matches the raw value at
`row[field]`. A column that renders a different label (e.g. `field: 'source'`
holding `'gitops' | 'manual'` but rendering "GitOps" / "Manually added") will
not match what the user sees typed in the search box. Fix it per column:

- Add a `customFilterAndSearch` that matches the displayed label, **or**
- Set `searchable: false` if the column should not participate in search (e.g. a
  badge-only column).

```tsx
{
  field: 'source',
  customFilterAndSearch: (query, row) =>
    SOURCE_LABELS[row.source].includes(query.toLowerCase()),
  render: row => <SourceBadge source={row.source} />,
}
```

### Token-boundary search

The shared Table only **filters** rows on search; it cannot re-order them by a
relevance score. If you need word-boundary matching (so `"dex"` does not match
`"index"`), implement it inside `customFilterAndSearch` with a small tokenizer
(split on `/[^a-z0-9]+/`, require each query token to be a prefix of some text
token). Do not expect relevance ranking — only matching is achievable.

### Prefer plain row objects over class instances

Map domain objects (e.g. `KubeObject` subclasses) to a plain `RowType` in a data
provider before passing them as `data`. Default `field`-based sort/search work on
plain values; class getters do not, and you would otherwise need `customSort` +
`customFilterAndSearch` on every column.

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

### Responsive column widths & truncation

To make one column (e.g. Name) absorb the remaining space while the rest stay
compact, give the secondary columns explicit widths and the primary one
`width: 'auto'`, and enable fixed layout:

```tsx
options={{ /* ... */ tableLayout: 'fixed' }}
// columns:
{ field: 'name', width: 'auto', /* ... */ }
{ field: 'namespace', width: '15%' }
{ field: 'source', width: '10%' }
```

With `tableLayout: 'fixed'`, cells honor the declared widths. This also makes
**CSS ellipsis responsive**: render the name with `noWrap` so it truncates to
the actual cell width (full text on a wide viewport, ellipsis only when narrow),
and keep the full value in a `title`. Do **not** hard-truncate with
`String.slice(0, N)` — that is fixed regardless of available width and loses
information on wide screens.

```tsx
<Link to={to} title={row.name} noWrap display="block">
  {row.name}
</Link>
```

### Custom toolbar content (e.g. a "Create" button)

To add a custom element next to the search / columns button, override
`components.Toolbar` and render the default `MTableToolbar` plus your element.
Requires declaring `@material-table/core` in the plugin's `package.json`.

```tsx
import { MTableToolbar } from '@material-table/core';

// Memoize so the toolbar (and its search box / any open dialog) is not
// remounted on every data refetch:
const ToolbarComponent = useMemo(
  () => (props: React.ComponentProps<typeof MTableToolbar>) => (
    <Box display="flex" alignItems="center">
      <Box flexGrow={1}><MTableToolbar {...props} /></Box>
      <Box flexShrink={0} mr={2}><CreateButton /></Box>
    </Box>
  ),
  [/* deps the button needs */],
);

<Table components={{ Toolbar: ToolbarComponent }} options={{ columnsButton: true }} />
```

Avoid the `components.Action` hack (a dummy free-action whose icon renders the
button): material-table renders `Action` once per entry in `actions`, so it
silently duplicates the moment a second action is added.

## Faceted Sidebar Filters

List pages (Deployments, Installations, Workflows) filter via a sidebar of
facets, not just the built-in search. All building blocks come from
`@giantswarm/backstage-plugin-ui-react`: `FiltersLayout`, `MultiplePicker`
(+ `MultiplePickerOption`), `useFilters`, `FacetFilter`, `FiltersData`. Reference:
`plugins/gs/src/components/deployments/` (`DeploymentsDataProvider`,
`DeploymentsPage/filters/`).

1. **Filter classes** implement `FacetFilter` (`filter(row)` + `toQueryValue()`),
   one per facet, returning `true` when no values are selected.
2. **A data provider** runs `useFilters<MyFilters>()` and computes
   `filteredData = data.filter(row => activeFilters.every(f => f.filter(row)))`;
   it exposes `{ data, filteredData, filters, queryParameters, updateFilters }`
   via context. Derive facet options from `data` (not `filteredData`) so options
   don't disappear as the user selects.
3. **Picker components** read the context and render `<MultiplePicker autocomplete>`,
   calling `updateFilters({ key: new MyFilter(values) })`.
4. **Layout**: wrap in `<FiltersLayout>` with `.Filters` (the pickers) and
   `.Content` (the Table). `useFilters` persists selections to `?filters[...]`
   URL params automatically.
