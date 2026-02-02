import { useMemo } from 'react';
import { Table } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useHelmChartTags } from '../../../hooks/useHelmChartTags';
import { ChartTagData, getInitialColumns } from './columns';
import { parseChartRef } from '../../../utils/parseChartRef';

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

  let emptyContent = null;
  if (error) {
    if (error.name !== 'NotFoundError') {
      return <Typography color="error">{error.message}</Typography>;
    }

    const { repository } = parseChartRef(chartRef);
    emptyContent = (
      <Box px={2} py={8}>
        <Typography variant="inherit" color="textSecondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Typography>
      </Box>
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
          Tags for {chartName} chart ({tableData.length})
        </Typography>
      }
      columns={columns}
      emptyContent={emptyContent}
    />
  );
};
