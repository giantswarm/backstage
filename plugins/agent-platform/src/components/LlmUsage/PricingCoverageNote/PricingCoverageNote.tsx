import { makeStyles, Theme } from '@material-ui/core';
import { Alert, Cell, CellText, Link, Table, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import type { UnpricedModelRow } from '../../../lib/llmUsage';
import { formatCount } from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';

const useStyles = makeStyles((_theme: Theme) => ({
  number: {
    fontVariantNumeric: 'tabular-nums',
  },
}));

/**
 * What each non-`Exact` lookup status means, so the reader knows whether to
 * add a price or a whole catalogue.
 */
const STATUS_MEANING: Record<string, string> = {
  Unpriced: 'in the catalogue, but with no rate for a token type',
  Missing: 'not in the catalogue',
  NoCatalog: 'no price catalogue is configured at all',
};

/**
 * The compact warning, for a view that shows cost figures but not the detail.
 *
 * Renders nothing when every lookup resolved — the healthy state is silence,
 * not a green tick nobody needs. When it does render, it is the *only* thing
 * that distinguishes "this platform is cheap" from "this platform's spend is
 * not being counted": the gateway records no cost at all for a model it cannot
 * price, so an unpriced model reads as zero, not as an error.
 */
export function PricingCoverageAlert({
  rows,
  costHref,
}: {
  rows: UnpricedModelRow[];
  /** Link to the Cost tab, where {@link PricingCoverageNote} names the models. */
  costHref?: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  // Counted by model, not by row: one model can fail its lookup under more
  // than one requested name, and "3 models have no usable price" about the
  // same model three times would overstate the problem.
  const count = new Set(rows.map(row => row.responseModel)).size;

  return (
    <Alert
      status="warning"
      title={`${count} ${count === 1 ? 'model has' : 'models have'} no usable price`}
      description={`Every cost figure here understates the real bill by whatever ${
        count === 1 ? 'that model' : 'those models'
      } spent. Token counts are unaffected.`}
      customActions={
        costHref ? (
          <Link href={costHref}>Which models, and why</Link>
        ) : undefined
      }
    />
  );
}

/**
 * The detail table: every model whose price lookup did not resolve, and what
 * to do about it.
 *
 * Empty is the healthy state, so this renders nothing rather than an empty
 * table — there is no useful "all models priced" view of an absence.
 */
export function PricingCoverageNote({ rows }: { rows: UnpricedModelRow[] }) {
  const classes = useStyles();

  const columnConfig: ColumnConfig<UnpricedModelRow>[] = [
    {
      id: 'responseModel',
      label: 'Answered model',
      isRowHeader: true,
      isSortable: true,
      cell: row => <CellText title={row.responseModel} />,
    },
    {
      id: 'requestModel',
      label: 'Requested model',
      isSortable: true,
      cell: row => <CellText title={row.requestModel} />,
    },
    {
      id: 'status',
      label: 'Why',
      isSortable: true,
      cell: row => (
        <CellText
          title={row.status}
          description={STATUS_MEANING[row.status] ?? undefined}
        />
      ),
    },
    {
      id: 'lookups',
      label: 'Lookups',
      isSortable: true,
      cell: row => (
        <Cell>
          <span className={classes.number}>{formatCount(row.lookups)}</span>
        </Cell>
      ),
    },
  ];

  const { tableProps } = useTable<UnpricedModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: (data, sort) => sortUsageRows(data, sort, 'responseModel'),
    initialSort: { column: 'lookups', direction: 'descending' },
    paginationOptions: { type: 'none' },
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <UsageCard
      title="Models with no usable price"
      wide
      note="Add these to llmRouting.modelCatalog in the platform's Helm values, and the cost figures above start counting them."
    >
      <Table<UnpricedModelRow> {...tableProps} columnConfig={columnConfig} />
    </UsageCard>
  );
}
