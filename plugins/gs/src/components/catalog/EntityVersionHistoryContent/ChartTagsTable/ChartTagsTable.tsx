import { useMemo } from 'react';
import { Table } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useHelmChartTags } from '../../../hooks/useHelmChartTags';
import { ChartTagData, getInitialColumns } from './columns';

const TABLE_ID = 'chart-tags';

type ChartTagsTableProps = {
  chartRef: string;
  chartName: string;
};

export const ChartTagsTable = ({
  chartRef,
  chartName,
}: ChartTagsTableProps) => {
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(chartRef);

  const { visibleColumns } = useTableColumns(TABLE_ID);

  const tableData: ChartTagData[] = useMemo(() => {
    if (!tags) {
      return [];
    }

    return tags.map(tagInfo => ({
      tag: tagInfo.tag,
      isLatest: tagInfo.tag === latestStableVersion,
      createdAt: tagInfo.createdAt,
    }));
  }, [tags, latestStableVersion]);

  const columns = useMemo(
    () => getInitialColumns(visibleColumns),
    [visibleColumns],
  );

  if (error) {
    return (
      <Typography color="error">
        Failed to load tags: {error.message}
      </Typography>
    );
  }

  return (
    <Table<ChartTagData>
      isLoading={isLoading}
      options={{
        pageSize: 50,
        pageSizeOptions: [10, 25, 50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      data={tableData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Tags for {chartName} ({tableData.length})
        </Typography>
      }
      columns={columns}
    />
  );
};
